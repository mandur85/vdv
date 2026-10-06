/**
 * Настройки сайта: читает data/site.json и применяет их к странице.
 *
 * Зачем отдельный файл, если значения и так лежат в разметке: разметка —
 * это то, что видит посетитель, и она должна работать сама по себе. Файл
 * настроек нужен админке, чтобы править сайт из браузера, не трогая HTML.
 *
 * Если файла нет или он битый, сайт молча берёт значения из разметки.
 * Поэтому DEFAULTS ниже должны совпадать с тем, что уже на странице.
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        version: 1,
        contacts: {
            fullName: 'ИГОО ВДВ «Союз Десантников»',
            leader: 'Председатель совета Таут Сергей Викторович',
            address: '627750, Тюменская обл., г. Ишим, ул. Ленина, д. 39',
            inn: '7224095731',
            kpp: '722401001',
            ogrn: '1257200011023 от 04.07.2025',
            email: 'soyuz.vdvishim@mail.ru',
            phone: '',
            vk: 'https://vk.ru/vdvishim'
        },
        banner: { enabled: false, text: '', link: '', linkText: '' },
        techMode: { enabled: false, text: '' },
        hidden: [],
        schedule: [],
        pinnedPostId: null
    };

    var current = DEFAULTS;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    /** Сливает присланное с умолчаниями, чтобы не потерять новые поля. */
    function merge(base, patch) {
        var out = clone(base);
        if (!patch || typeof patch !== 'object') { return out; }
        Object.keys(patch).forEach(function (key) {
            var value = patch[key];
            if (value && typeof value === 'object' && !Array.isArray(value) &&
                out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
                out[key] = merge(out[key], value);
            } else if (value !== undefined && value !== null) {
                out[key] = value;
            }
        });
        return out;
    }

    function fill(key, value) {
        if (value === undefined || value === null || value === '') { return; }
        var nodes = document.querySelectorAll('[data-contact="' + key + '"]');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].textContent = value;
        }
    }

    function applyBanner(banner) {
        var box = document.getElementById('site-banner');
        if (!box) { return; }
        if (!banner || !banner.enabled || !banner.text) {
            box.hidden = true;
            return;
        }
        var text = box.querySelector('[data-banner-text]');
        var link = box.querySelector('[data-banner-link]');
        if (text) { text.textContent = banner.text; }
        if (link) {
            if (banner.link) {
                link.href = banner.link;
                link.textContent = banner.linkText || 'Подробнее';
                link.hidden = false;
            } else {
                link.hidden = true;
            }
        }
        box.hidden = false;
    }

    function applyTech(tech) {
        var box = document.getElementById('site-tech');
        if (!box) { return; }
        if (!tech || !tech.enabled) {
            box.hidden = true;
            document.body.classList.remove('is-tech');
            return;
        }
        var text = box.querySelector('[data-tech-text]');
        if (text) {
            text.textContent = tech.text || 'Сайт временно недоступен: идут технические работы.';
        }
        box.hidden = false;
        document.body.classList.add('is-tech');
    }

    function applyHidden(hidden) {
        if (!hidden || !hidden.length) { return; }
        hidden.forEach(function (id) {
            var node = document.getElementById(id);
            if (node) { node.hidden = true; }
        });
    }

    function applyContacts(contacts) {
        if (!contacts) { return; }
        fill('fullName', contacts.fullName);
        fill('leader', contacts.leader);
        fill('address', contacts.address);
        fill('inn', contacts.inn);
        fill('kpp', contacts.kpp);
        fill('ogrn', contacts.ogrn);
        fill('phone', contacts.phone);

        if (contacts.email) {
            var mail = document.querySelectorAll('[data-contact-mail]');
            for (var i = 0; i < mail.length; i++) {
                mail[i].textContent = contacts.email;
                mail[i].href = 'mailto:' + contacts.email;
            }
        }
        if (contacts.vk) {
            var vk = document.querySelectorAll('[data-contact-vk]');
            for (var j = 0; j < vk.length; j++) {
                vk[j].href = contacts.vk;
            }
        }
    }

    function apply(settings) {
        applyBanner(settings.banner);
        applyTech(settings.techMode);
        applyContacts(settings.contacts);
        applyHidden(settings.hidden);
        return settings;
    }

    function url() {
        return 'data/site.json?t=' + Date.now();
    }

    function load() {
        return fetch(url(), { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) { throw new Error('HTTP ' + res.status); }
                return res.json();
            })
            .then(function (data) {
                current = merge(DEFAULTS, data);
                apply(current);
                return current;
            })
            .catch(function () {
                // Файла нет или он не читается — остаётся то, что есть в разметке.
                current = clone(DEFAULTS);
                return current;
            });
    }

    global.VDVSettings = {
        DEFAULTS: DEFAULTS,
        load: load,
        apply: apply,
        merge: merge,
        current: function () { return current; },
        setCurrent: function (value) { current = merge(DEFAULTS, value); return current; }
    };
}(window));
