/**
 * Инструменты админки: правка настроек сайта и загрузка фотографий.
 *
 * Всё, что здесь есть, уезжает в репозиторий файлами: настройки — в
 * data/site.json, снимки — в photos/. Страницу править руками не нужно,
 * поэтому заказчик может работать сам, ничего не сломав в вёрстке.
 *
 * Модуль включается только после входа и только если есть токен GitHub.
 */
(function (global) {
    'use strict';

    var G = global.VDVGitHub;
    var S = global.VDVSettings;
    var root = document.getElementById('am-content-tools');

    if (!root || !G || !S) { return; }

    var SECTIONS = [
        ['about', 'О Союзе'],
        ['mission', 'Миссия'],
        ['news', 'Новости'],
        ['photos', 'Фотографии'],
        ['contacts', 'Контакты']
    ];

    var state = { settings: null, posts: null };

    // ------------------------------------------------------------- мелочи

    function h(tag, attrs, kids) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (key) {
            if (key === 'class') { node.className = attrs[key]; }
            else if (key === 'text') { node.textContent = attrs[key]; }
            else if (key.indexOf('on') === 0) { node.addEventListener(key.slice(2), attrs[key]); }
            else { node.setAttribute(key, attrs[key]); }
        });
        (kids || []).forEach(function (kid) {
            if (kid) { node.appendChild(kid); }
        });
        return node;
    }

    function say(text, kind) {
        var box = document.getElementById('at-msg');
        if (!box) { return; }
        box.textContent = text || '';
        box.className = 'modal__msg' + (kind ? ' modal__msg--' + kind : '');
    }

    function group(title) {
        return h('div', { class: 'at-group' }, [
            h('h4', { class: 'at-group__title', text: title })
        ]);
    }

    function field(labelText, input) {
        return h('div', { class: 'form-group' }, [
            h('label', { for: input.id, text: labelText }),
            input
        ]);
    }

    function textInput(id, value, type) {
        return h('input', { type: type || 'text', id: id, value: value === undefined ? '' : value });
    }

    function textArea(id, value, rows) {
        var node = h('textarea', { id: id, rows: rows || 3 });
        node.value = value === undefined ? '' : value;
        return node;
    }

    function check(id, labelText, checked) {
        var input = h('input', { type: 'checkbox', id: id });
        input.checked = !!checked;
        return h('div', { class: 'at-check' }, [
            input,
            h('label', { for: id, text: labelText })
        ]);
    }

    function val(id) {
        var node = document.getElementById(id);
        return node ? node.value.trim() : '';
    }

    function checked(id) {
        var node = document.getElementById(id);
        return !!(node && node.checked);
    }

    function busy(on, text) {
        var btn = document.getElementById('at-save');
        if (btn) {
            btn.disabled = on;
            btn.textContent = on ? (text || 'СОХРАНЯЕМ…') : 'СОХРАНИТЬ НАСТРОЙКИ';
        }
    }

    // ------------------------------------------------------------- токен

    function renderToken() {
        var input = h('input', {
            type: 'password', id: 'at-token', autocomplete: 'off',
            placeholder: 'ghp_…', spellcheck: 'false'
        });
        var wrap = h('div', { class: 'at-token' }, [
            field('Токен GitHub (право записи в репозиторий)', input),
            h('p', { class: 'at-note', text:
                'Токен живёт только в этой вкладке и никуда не сохраняется. ' +
                'Создать: GitHub → Settings → Developer settings → ' +
                'Personal access tokens → Fine-grained, доступ Contents: read and write.' }),
            h('div', { class: 'at-row' }, [
                h('button', { type: 'button', class: 'at-btn', text: 'ПОДКЛЮЧИТЬ',
                    onclick: function () {
                        if (!G.setToken(val('at-token'))) {
                            return say('Введите токен.', 'error');
                        }
                        say('Токен принят.', 'ok');
                        load();
                    } }),
                h('button', { type: 'button', class: 'at-btn at-btn--ghost', text: 'ОТКЛЮЧИТЬ',
                    onclick: function () {
                        G.setToken('');
                        document.getElementById('at-token').value = '';
                        say('Токен удалён из вкладки.');
                    } })
            ])
        ]);
        return wrap;
    }

    // ------------------------------------------------------------- настройки

    function renderContacts(c) {
        return h('div', {}, [
            field('Полное название', textInput('at-fullName', c.fullName)),
            field('Руководитель', textInput('at-leader', c.leader)),
            field('Адрес', textInput('at-address', c.address)),
            h('div', { class: 'at-two' }, [
                field('ИНН', textInput('at-inn', c.inn)),
                field('КПП', textInput('at-kpp', c.kpp))
            ]),
            field('ОГРН', textInput('at-ogrn', c.ogrn)),
            h('div', { class: 'at-two' }, [
                field('Почта', textInput('at-email', c.email, 'email')),
                field('Телефон', textInput('at-phone', c.phone, 'tel'))
            ]),
            field('Ссылка на ВКонтакте', textInput('at-vk', c.vk, 'url'))
        ]);
    }

    function renderBanner(b) {
        return h('div', {}, [
            check('at-banner-on', 'Показывать объявление', b.enabled),
            field('Текст объявления', textArea('at-banner-text', b.text, 2)),
            h('div', { class: 'at-two' }, [
                field('Ссылка', textInput('at-banner-link', b.link, 'url')),
                field('Текст ссылки', textInput('at-banner-linkText', b.linkText))
            ])
        ]);
    }

    function renderTech(t) {
        return h('div', {}, [
            check('at-tech-on', 'Включить режим технических работ', t.enabled),
            field('Что видят посетители', textArea('at-tech-text', t.text, 2))
        ]);
    }

    function renderHidden(hidden) {
        return h('div', { class: 'at-checks' }, SECTIONS.map(function (pair) {
            return check('at-hide-' + pair[0], pair[1], hidden.indexOf(pair[0]) !== -1);
        }));
    }

    function renderSchedule(items) {
        var box = h('div', { class: 'at-schedule' });
        var list = items && items.length ? items : [{ date: '', title: '', text: '' }];

        function row(item) {
            var rowBox = h('div', { class: 'at-rowitem' }, [
                field('Дата', textInput('', item.date, 'date')),
                field('Название', textInput('', item.title)),
                field('Подпись', textInput('', item.text)),
                h('button', { type: 'button', class: 'at-btn at-btn--ghost', text: 'УБРАТЬ',
                    onclick: function () {
                        rowBox.parentNode.removeChild(rowBox);
                    } })
            ]);
            rowBox.querySelectorAll('input').forEach(function (input, index) {
                input.id = 'at-sch-' + Math.random().toString(36).slice(2, 9) + '-' + index;
            });
            return rowBox;
        }

        list.forEach(function (item) { box.appendChild(row(item)); });

        box.appendChild(h('button', { type: 'button', class: 'at-btn at-btn--ghost', text: 'ДОБАВИТЬ СТРОКУ',
            onclick: function () { box.insertBefore(row({ date: '', title: '', text: '' }), box.lastChild); } }));

        return box;
    }

    function collectSchedule() {
        var out = [];
        document.querySelectorAll('.at-schedule .at-rowitem').forEach(function (rowBox) {
            var inputs = rowBox.querySelectorAll('input');
            if (inputs.length < 3) { return; }
            var date = inputs[0].value.trim();
            var title = inputs[1].value.trim();
            var text = inputs[2].value.trim();
            if (date || title || text) { out.push({ date: date, title: title, text: text }); }
        });
        return out;
    }

    function renderPinned(posts, pinnedId) {
        var select = h('select', { id: 'at-pinned' });
        select.appendChild(h('option', { value: '', text: 'Ничего не закреплять' }));
        (posts || []).forEach(function (post, index) {
            var option = h('option', { value: String(index), text: (post.title || 'Без названия').slice(0, 70) });
            select.appendChild(option);
        });
        if (pinnedId !== null && pinnedId !== undefined) {
            select.value = String(pinnedId);
        }
        return field('Закрепить запись', select);
    }

    // ------------------------------------------------------------- фото

    function renderPhoto() {
        var input = h('input', { type: 'file', id: 'at-photo', accept: 'image/*' });
        var out = h('p', { class: 'at-note', id: 'at-photo-out' });
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (!file) { return; }
            out.textContent = 'Сжимаем и загружаем…';
            G.uploadPhoto(file).then(function (res) {
                out.textContent = 'Готово: ' + res.path;
            }).catch(function (err) {
                out.textContent = 'Не вышло: ' + err.message;
            });
        });
        return h('div', {}, [field('Загрузить фотографию', input), out]);
    }

    // ------------------------------------------------------------- новости

    /** Адрес записи латиницей: он попадает в ссылку и в имя файла. */
    function slugify(title) {
        var MAP = {
            а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',
            л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',
            ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
        };
        var out = '';
        var text = String(title || '').toLowerCase();
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (MAP[ch] !== undefined) { out += MAP[ch]; }
            else if (/[a-z0-9]/.test(ch)) { out += ch; }
            else if (/[а-яё]/.test(ch)) { /* уже обработано выше */ }
            else { out += '-'; }
        }
        return out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'zapis';
    }

    function nextId(posts, date) {
        var base = String(date || '').replace(/-/g, '') || String(Date.now()).slice(0, 8);
        var id = parseInt(base, 10) || 0;
        var taken = posts.map(function (p) { return p.id; });
        while (taken.indexOf(id) !== -1) { id += 1; }
        return id;
    }

    function blankPost() {
        var today = new Date().toISOString().slice(0, 10);
        return {
            id: nextId([], today), slug: '', type: 'event', date: today,
            title: '', lead: '', text: '', cover: null, photos: [],
            vk_url: null, source: 'manual'
        };
    }

    function renderNews(posts) {
        var box = h('div', { class: 'at-news' });
        var list = posts && posts.length ? posts : [blankPost()];

        list.forEach(function (post, index) {
            var type = h('select', {}, []);
            [['event', 'Событие'], ['news', 'Новость']].forEach(function (pair) {
                var option = h('option', { value: pair[0], text: pair[1] });
                if ((post.type || 'event') === pair[0]) { option.selected = true; }
                type.appendChild(option);
            });

            var item = h('div', { class: 'at-rowitem', 'data-index': String(index) }, [
                h('div', { class: 'at-two' }, [
                    field('Тип', type),
                    field('Дата', textInput('', post.date, 'date'))
                ]),
                field('Заголовок', textInput('', post.title)),
                field('Короткая выдержка', textArea('', post.lead, 2)),
                field('Полный текст', textArea('', post.text, 5)),
                field('Ссылка на пост ВК', textInput('', post.vk_url, 'url')),
                field('Фотографии (пути через запятую)', textInput('', (post.photos || []).join(', '))),
                h('button', { type: 'button', class: 'at-btn at-btn--ghost', text: 'УДАЛИТЬ ЗАПИСЬ',
                    onclick: function () {
                        item.parentNode.removeChild(item);
                    } })
            ]);

            item.querySelectorAll('input, textarea').forEach(function (input, i) {
                input.id = 'at-news-' + index + '-' + i;
            });
            box.appendChild(item);
        });

        box.appendChild(h('button', { type: 'button', class: 'at-btn at-btn--ghost', text: 'ДОБАВИТЬ ЗАПИСЬ',
            onclick: function () {
                var fresh = blankPost();
                var node = renderNews([fresh]).firstChild;
                box.insertBefore(node, box.lastChild);
                renumber(box);
            } }));

        return box;
    }

    /** После добавления и удаления индексы в разметке сбиваются — поправим. */
    function renumber(box) {
        box.querySelectorAll('.at-rowitem').forEach(function (item, index) {
            item.setAttribute('data-index', String(index));
        });
    }

    function collectNews() {
        var out = [];
        document.querySelectorAll('.at-news .at-rowitem').forEach(function (item) {
            var texts = item.querySelectorAll('input[type="text"]');
            var areas = item.querySelectorAll('textarea');
            var title = texts[0] ? texts[0].value.trim() : '';
            if (!title) { return; }

            var date = item.querySelector('input[type="date"]').value;
            var url = item.querySelector('input[type="url"]');
            var photosRaw = texts[texts.length - 1] ? texts[texts.length - 1].value : '';

            out.push({
                id: nextId(out, date),
                slug: slugify(title),
                type: item.querySelector('select').value,
                date: date,
                title: title,
                lead: areas[0] ? areas[0].value.trim() : '',
                text: areas[1] ? areas[1].value.trim() : '',
                cover: null,
                photos: photosRaw.split(',').map(function (p) { return p.trim(); })
                        .filter(function (p) { return p; }),
                vk_url: url && url.value.trim() ? url.value.trim() : null,
                source: 'manual'
            });
        });
        return out;
    }

    // ------------------------------------------------------------- сборка

    function collect() {
        var s = state.settings;
        var hidden = SECTIONS.filter(function (pair) {
            return checked('at-hide-' + pair[0]);
        }).map(function (pair) { return pair[0]; });

        var pinned = val('at-pinned');
        var pinnedId = pinned === '' ? null : parseInt(pinned, 10);
        var chosen = (pinnedId !== null && state.posts) ? state.posts[pinnedId] : null;

        return {
            version: s.version,
            contacts: {
                fullName: val('at-fullName'),
                leader: val('at-leader'),
                address: val('at-address'),
                inn: val('at-inn'),
                kpp: val('at-kpp'),
                ogrn: val('at-ogrn'),
                email: val('at-email'),
                phone: val('at-phone'),
                vk: val('at-vk')
            },
            banner: {
                enabled: checked('at-banner-on'),
                text: val('at-banner-text'),
                link: val('at-banner-link'),
                linkText: val('at-banner-linkText')
            },
            techMode: {
                enabled: checked('at-tech-on'),
                text: val('at-tech-text')
            },
            hidden: hidden,
            schedule: collectSchedule(),
            pinnedPostId: chosen ? (chosen.id !== undefined ? chosen.id : pinnedId) : null
        };
    }

    function render() {
        var s = state.settings;
        root.innerHTML = '';
        root.appendChild(renderToken());

        if (!G.hasToken()) {
            root.appendChild(h('p', { class: 'at-note', text:
                'Введите токен GitHub — и здесь появятся настройки сайта и загрузка фото.' }));
            return;
        }
        if (!s) {
            root.appendChild(h('p', { class: 'at-note', text: 'Загружаем настройки…' }));
            return;
        }

        root.appendChild(h('div', { class: 'at-row' }, [
            h('button', { type: 'button', id: 'at-save', class: 'at-btn', text: 'СОХРАНИТЬ НАСТРОЙКИ',
                onclick: function () {
                    busy(true);
                    G.saveSettings(collect()).then(function (saved) {
                        state.settings = saved;
                        S.setCurrent(saved);
                        S.apply(saved);
                        busy(false);
                        say('Сохранено. На сайте появится в течение получаса.', 'ok');
                    }).catch(function (err) {
                        busy(false);
                        say(err.message, 'error');
                    });
                } }),
            h('button', { type: 'button', class: 'at-btn at-btn--ghost', text: 'ПЕРЕЧИТАТЬ',
                onclick: load })
        ]));
        root.appendChild(h('p', { class: 'modal__msg', id: 'at-msg', role: 'status' }));

        root.appendChild(group('Контакты'));
        root.appendChild(renderContacts(s.contacts || {}));

        root.appendChild(group('Объявление'));
        root.appendChild(renderBanner(s.banner || {}));

        root.appendChild(group('Технические работы'));
        root.appendChild(renderTech(s.techMode || {}));

        root.appendChild(group('Скрытые разделы'));
        root.appendChild(h('p', { class: 'at-note', text:
            'Отмеченные разделы исчезнут с главной страницы. Секцию «Главный экран» скрыть нельзя.' }));
        root.appendChild(renderHidden(s.hidden || []));

        root.appendChild(group('Расписание и анонсы'));
        root.appendChild(renderSchedule(s.schedule || []));

        root.appendChild(group('Закрепление записи'));
        root.appendChild(renderPinned(state.posts, s.pinnedPostId));

        root.appendChild(group('Новости и события'));
        root.appendChild(h('p', { class: 'at-note', text:
            'Записи с пометкой «вручную» не затираются при ежедневной загрузке из ВК. ' +
            'Сайт собирается из этого файла, поэтому изменения появятся в течение получаса.' }));
        root.appendChild(renderNews(state.posts));
        root.appendChild(h('div', { class: 'at-row' }, [
            h('button', { type: 'button', id: 'at-save-news', class: 'at-btn', text: 'СОХРАНИТЬ НОВОСТИ',
                onclick: function () {
                    var posts = collectNews();
                    if (!posts.length) {
                        return say('Нужна хотя бы одна запись с заголовком.', 'error');
                    }
                    var btn = root.querySelector('#at-save-news');
                    if (btn) { btn.disabled = true; }
                    G.saveNews(posts).then(function () {
                        state.posts = posts;
                        if (btn) { btn.disabled = false; }
                        say('Новости сохранены.', 'ok');
                    }).catch(function (err) {
                        if (btn) { btn.disabled = false; }
                        say(err.message, 'error');
                    });
                } })
        ]));

        root.appendChild(group('Фотографии'));
        root.appendChild(renderPhoto());
    }

    function load() {
        if (!G.hasToken()) {
            state.settings = null;
            render();
            return;
        }
        G.loadSettings().then(function (file) {
            state.settings = file.data;
            return G.loadNews().catch(function () { return { data: [] }; });
        }).then(function (file) {
            state.posts = file.data || [];
            render();
        }).catch(function (err) {
            state.settings = null;
            render();
            say(err.message, 'error');
        });
    }

    global.VDVAdminTools = { render: render, load: load };
}(window));
