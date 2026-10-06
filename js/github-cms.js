/**
 * Запись на сайт прямо из браузера через GitHub API.
 *
 * Как это работает. Сайт — это обычные файлы в репозитории: разметка,
 * фотографии, data/site.json. Чтобы поменять текст объявления или добавить
 * снимок, браузер шлёт в GitHub обычный PUT, и GitHub сам делает коммит.
 * Никакого сервера не нужно — ровно поэтому сайт и называется статическим.
 *
 * Про токен. Нужен личный токен (PAT) с правом записи в один репозиторий.
 * Он живёт только в памяти вкладки: закрыли вкладку — токена больше нет,
 * придётся ввести заново. В localStorage, в файлах репозитория и в разметке
 * его нет, так что в общий кэш сайта он не попадает.
 *
 * Чего модуль не делает: он не прячет токен от того, кто открыл инструменты
 * разработчика в тот момент, когда токен введён. Это цена работы без сервера.
 */
(function (global) {
    'use strict';

    var CONFIG = global.VDV_CONFIG || {};
    var REPO = CONFIG.repo || {};
    var FILES = CONFIG.files || {};
    var PHOTO = CONFIG.photo || { maxWidth: 1400, quality: 0.82 };

    var token = null;                 // только в памяти вкладки
    var listeners = [];

    // ---------------------------------------------------------------- токен

    function hasToken() {
        return !!token;
    }

    function setToken(value) {
        token = String(value || '').trim() || null;
        listeners.forEach(function (fn) { fn(hasToken()); });
        return hasToken();
    }

    function onTokenChange(fn) {
        listeners.push(fn);
        return function () {
            listeners = listeners.filter(function (other) { return other !== fn; });
        };
    }

    // --------------------------------------------------------------- основы

    function configured() {
        return !!(REPO.owner && REPO.name && REPO.branch &&
                  REPO.owner.indexOf('ЗАПОЛНИТЬ') === -1 &&
                  REPO.name.indexOf('ЗАПОЛНИТЬ') === -1);
    }

    function apiUrl(path) {
        return REPO.api + '/repos/' + REPO.owner + '/' + REPO.name +
               '/contents/' + path + '?ref=' + encodeURIComponent(REPO.branch);
    }

    function headers(extra) {
        var head = { 'Accept': 'application/vnd.github+json' };
        if (token) { head.Authorization = 'Bearer ' + token; }
        if (extra) {
            Object.keys(extra).forEach(function (key) { head[key] = extra[key]; });
        }
        return head;
    }

    /** Кириллица в base64: сперва в UTF-8 байты, потом уже в base64. */
    function toBase64(text) {
        var bytes = new TextEncoder().encode(text);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
    }

    function fromBase64(b64) {
        var bin = atob(String(b64).replace(/\n/g, ''));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    /** Ошибки GitHub переводим в слова, а не в коды. */
    function fail(res, body) {
        var err = new Error('GitHub: HTTP ' + res.status);
        err.status = res.status;
        if (res.status === 401) {
            err.message = 'Токен не принят. Проверьте, что он не истёк и не перебит.';
        } else if (res.status === 403) {
            err.message = 'Нет прав на запись. Токену нужен доступ «Contents: read and write» ' +
                          'к этому репозиторию.';
        } else if (res.status === 404) {
            err.message = 'Файл или репозиторий не найдены. Проверьте настройки репозитория.';
        } else if (res.status === 409 || res.status === 422) {
            err.message = 'Файл уже изменён. Обновите страницу и повторите.';
        } else if (body && body.message) {
            err.message = body.message;
        }
        return err;
    }

    function guard() {
        if (!token) { throw new Error('Сначала введите токен GitHub.'); }
        if (!configured()) {
            throw new Error('В js/site-config.js не указан репозиторий. ' +
                            'Впишите владельца и имя.');
        }
    }

    // ------------------------------------------------------- чтение и запись

    function readJson(path) {
        guard();
        return fetch(apiUrl(path), { headers: headers(), cache: 'no-store' })
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) { throw fail(res, body); }
                    return body;
                });
            })
            .then(function (body) {
                return { data: JSON.parse(fromBase64(body.content)), sha: body.sha };
            });
    }

    /**
     * Общая запись файла. content уже в base64 — так можно положить и текст,
     * и фотографию: GitHub сам разберётся, что это за байты.
     * sha обязателен для правки и не нужен для создания нового файла.
     */
    function putContent(path, content, message, sha) {
        var payload = {
            message: message,
            content: content,
            branch: REPO.branch
        };
        if (sha) { payload.sha = sha; }

        return fetch(apiUrl(path), {
            method: 'PUT',
            headers: headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        }).then(function (res) {
            return res.json().then(function (body) {
                if (!res.ok) { throw fail(res, body); }
                return body.content;
            });
        });
    }

    function writeFile(path, text, message, sha) {
        try { guard(); } catch (e) { return Promise.reject(e); }
        return putContent(path, toBase64(text), message, sha);
    }

    /** Читает, меняет и записывает JSON одним движением. */
    function editJson(path, mutate, message) {
        return readJson(path).then(function (file) {
            var next = mutate(file.data);
            var text = JSON.stringify(next, null, 2) + '\n';
            return writeFile(path, text, message, file.sha).then(function () { return next; });
        });
    }

    function loadSettings() {
        return readJson(FILES.settings || 'data/site.json');
    }

    function saveSettings(settings) {
        var copy = JSON.parse(JSON.stringify(settings));
        copy.updated = new Date().toISOString().slice(0, 10);
        return writeFile(FILES.settings || 'data/site.json',
                         JSON.stringify(copy, null, 2) + '\n',
                         'site: настройки сайта')
            .then(function () { return copy; });
    }

    function loadNews() {
        return readJson(FILES.news || 'data/vk_posts.json');
    }

    function saveNews(posts) {
        return writeFile(FILES.news || 'data/vk_posts.json',
                         JSON.stringify(posts, null, 2) + '\n',
                         'news: записи и события');
    }

    // ---------------------------------------------------------------- фото

    /** Уменьшает снимок и пережимает в WebP, чтобы сайт не разрастался. */
    function compress(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                var scale = Math.min(1, PHOTO.maxWidth / img.naturalWidth);
                var w = Math.max(1, Math.round(img.naturalWidth * scale));
                var h = Math.max(1, Math.round(img.naturalHeight * scale));
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(function (blob) {
                    if (!blob) { return reject(new Error('Браузер не смог обработать снимок.')); }
                    resolve({ blob: blob, width: w, height: h });
                }, 'image/webp', PHOTO.quality);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Это не похоже на фотографию.'));
            };
            img.src = url;
        });
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                var parts = String(reader.result).split(',');
                resolve(parts[1] || '');
            };
            reader.onerror = function () { reject(new Error('Не удалось прочитать файл.')); };
            reader.readAsDataURL(blob);
        });
    }

    /** Имя файла латиницей: кириллица в адресах GitHub выглядит неопрятно. */
    var TRANSLIT = {
        а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y',
        к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
        х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya'
    };

    function fileName(name) {
        var parts = String(name || 'photo').split('.');
        var base = parts.length > 1 ? parts.slice(0, -1).join('.') : parts[0];
        var out = '';
        for (var i = 0; i < base.length; i++) {
            var ch = base[i].toLowerCase();
            if (TRANSLIT[ch] !== undefined) {
                out += TRANSLIT[ch];
            } else if (/[a-z0-9]/.test(ch)) {
                out += ch;
            } else {
                out += '-';
            }
        }
        out = out.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
        var stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        return (out || 'photo') + '-' + stamp + '.webp';
    }

    /**
     * Кладёт снимок в photos/ и отдаёт путь для подстановки в новость.
     * Фото уезжает в репозиторий сразу и отмены нет — зато результат
     * сразу становится виден всем, кто откроет сайт.
     */
    function uploadPhoto(file) {
        try { guard(); } catch (e) { return Promise.reject(e); }
        var name = fileName(file.name);
        var path = (FILES.photos || 'photos') + '/' + name;
        return compress(file)
            .then(function (result) { return blobToBase64(result.blob); })
            .then(function (b64) {
                return putContent(path, b64, 'photo: ' + name).then(function () {
                    return { path: path, name: name };
                });
            });
    }

    global.VDVGitHub = {
        setToken: setToken,
        hasToken: hasToken,
        onTokenChange: onTokenChange,
        configured: configured,
        readJson: readJson,
        writeFile: writeFile,
        putContent: putContent,
        editJson: editJson,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        loadNews: loadNews,
        saveNews: saveNews,
        compress: compress,
        fileName: fileName,
        uploadPhoto: uploadPhoto
    };
}(window));
