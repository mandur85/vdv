/**
 * Скрытый вход в админку: шесть кликов по эмблеме на главной.
 *
 * Вход не уводит на отдельную страницу — окно открывается поверх главной,
 * поэтому человек, который случайно туда попал, ничего не потеряет.
 *
 * Как это устроено и чем это НЕ является: пароль хранится в localStorage
 * этого браузера в виде SHA-256 с солью. Любой посетитель может открыть
 * исходники и увидеть, как устроена проверка. Задача модуля — убрать
 * админку из поля зрения обычного посетителя, а не защитить её от того,
 * кто целенаправленно её ищет. Настоящая защита появится только с сервером.
 */
(function () {
    'use strict';

    var CLICKS_NEEDED = 6;
    var CLICK_WINDOW_MS = 1200;   // пауза длиннее этого сбрасывает счётчик

    var modal = document.getElementById('admin-modal');
    if (!modal || !window.Credentials) { return; }

    var C = window.Credentials;
    var box = {
        start: document.getElementById('am-start'),
        startLead: document.getElementById('am-start-lead'),
        go: document.getElementById('am-go'),
        login: document.getElementById('am-login'),
        user: document.getElementById('am-user'),
        pass: document.getElementById('am-pass'),
        loginMsg: document.getElementById('am-login-msg'),
        setup: document.getElementById('am-setup'),
        newUser: document.getElementById('am-new-user'),
        newPass: document.getElementById('am-new-pass'),
        newPass2: document.getElementById('am-new-pass2'),
        rules: document.getElementById('am-rules'),
        setupMsg: document.getElementById('am-setup-msg'),
        panel: document.getElementById('am-panel'),
        who: document.getElementById('am-who'),
        accounts: document.getElementById('am-accounts'),
        add: document.getElementById('am-add'),
        addUser: document.getElementById('am-add-user'),
        addPass: document.getElementById('am-add-pass'),
        addMsg: document.getElementById('am-add-msg'),
        out: document.getElementById('am-out'),
        tools: document.getElementById('am-content-tools')
    };

    var REASONS = {
        wrong: 'Неверный логин или пароль.',
        empty: 'Заполните оба поля.',
        missing: 'Такая запись не найдена.',
        storage: 'Браузер не разрешил сохранить пароль. Проверьте настройки приватности.',
        full: 'Больше ' + C.maxAccounts() + ' учётных записей добавить нельзя.',
        taken: 'Такой логин уже занят.',
        emptyLogin: 'Введите логин.',
        emptyPassword: 'Введите пароль.',
        short: 'Пароль короче ' + C.minPasswordLength() + ' символов.',
        long: 'Пароль длиннее ' + C.maxPasswordLength() + ' символов.',
        chars: 'Разрешены только латинские буквы, цифры и символы . ! ? _',
        digit: 'В пароле нужна хотя бы одна цифра.',
        symbol: 'В пароле нужен символ . ! ? или _',
        mismatch: 'Пароли не совпадают.'
    };

    function say(el, text, kind) {
        if (!el) { return; }
        el.textContent = text || '';
        el.className = 'modal__msg' + (kind ? ' modal__msg--' + kind : '');
    }

    function view(name) {
        box.start.hidden = name !== 'start';
        box.login.hidden = name !== 'login';
        box.setup.hidden = name !== 'setup';
        box.panel.hidden = name !== 'panel';
        document.getElementById('am-title').textContent =
            name === 'panel' ? 'Админка' : 'Вход';
    }

    // ------------------------------------------------------------- открытие

    function open() {
        var who = C.session();
        if (who) {
            renderPanel(who);
        } else if (C.list().length) {
            view('login');
        } else {
            view('start');
        }
        modal.hidden = false;
        modal.classList.add('is-open');
        document.addEventListener('keydown', onKey);
        var focus = who ? box.out : (box.go.offsetParent ? box.go : box.user);
        if (focus) { focus.focus(); }
    }

    function close() {
        modal.hidden = true;
        modal.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        box.pass.value = '';
        box.newPass.value = '';
        box.newPass2.value = '';
    }

    function onKey(e) {
        if (e.key === 'Escape') { close(); }
    }

    document.getElementById('am-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) { close(); }
    });

    // Шесть кликов по эмблеме. Счётчик сбрасывается, если человек отвлёкся.
    var emblem = document.querySelector('.hero__logo img') ||
                 document.querySelector('.hero__logo');
    if (emblem) {
        var count = 0;
        var last = 0;
        emblem.addEventListener('click', function () {
            var now = Date.now();
            count = (now - last > CLICK_WINDOW_MS) ? 1 : count + 1;
            last = now;
            if (count >= CLICKS_NEEDED) {
                count = 0;
                open();
            }
        });
    }

    // --------------------------------------------------------- первый запуск

    box.go.addEventListener('click', function () {
        if (C.list().length) {
            view('login');
            box.user.focus();
        } else {
            view('setup');
            box.newUser.focus();
        }
    });

    // ------------------------------------------------------------- вход

    box.login.addEventListener('submit', function (e) {
        e.preventDefault();
        say(box.loginMsg, '');
        var user = box.user.value.trim();
        var pass = box.pass.value;
        if (!user || !pass) {
            return say(box.loginMsg, REASONS.empty, 'error');
        }
        // Третий аргумент пустой: парольом может быть только пароль.
        C.verify(user, pass, '').then(function (res) {
            if (!res.ok) {
                if (res.reason === 'locked') {
                    return say(box.loginMsg,
                        'Слишком много попыток. Подождите ' + res.seconds + ' с.', 'error');
                }
                return say(box.loginMsg, REASONS[res.reason] || REASONS.wrong, 'error');
            }
            C.startSession(res.login);
            say(box.loginMsg, '');
            box.pass.value = '';
            renderPanel(res.login);
        });
    });

    // ------------------------------------------------- создание первой записи

    function checkRules() {
        var pass = box.newPass.value;
        var state = {
            len: pass.length >= C.minPasswordLength() &&
                  pass.length <= C.maxPasswordLength(),
            chars: /^[A-Za-z0-9.!?_]*$/.test(pass),
            digit: /[0-9]/.test(pass),
            symbol: /[.!?_]/.test(pass)
        };
        var items = box.rules.querySelectorAll('li[data-rule]');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('is-ok', !!state[items[i].getAttribute('data-rule')]);
        }
        return state;
    }

    box.newPass.addEventListener('input', function () {
        checkRules();
        say(box.setupMsg, '');
    });

    box.setup.addEventListener('submit', function (e) {
        e.preventDefault();
        say(box.setupMsg, '');
        var login = box.newUser.value.trim();
        var pass = box.newPass.value;
        var again = box.newPass2.value;

        if (!login) { return say(box.setupMsg, REASONS.emptyLogin, 'error'); }
        if (pass !== again) { return say(box.setupMsg, REASONS.mismatch, 'error'); }

        var state = checkRules();
        var verdict = C.validatePassword(pass);
        if (!verdict.ok) { return say(box.setupMsg, REASONS[verdict.code] || 'Пароль не подходит.', 'error'); }
        if (!state.len) {
            return say(box.setupMsg, pass.length > C.maxPasswordLength()
                ? REASONS.long : REASONS.short, 'error');
        }

        C.add(login, pass).then(function (res) {
            if (!res.ok) {
                return say(box.setupMsg, REASONS[res.reason] || 'Не удалось сохранить.', 'error');
            }
            C.startSession(res.login);
            box.newPass.value = '';
            box.newPass2.value = '';
            renderPanel(res.login);
        });
    });

    // ------------------------------------------------------------- панель

    function renderPanel(who) {
        box.who.textContent = who;
        view('panel');
        renderAccounts();
        // Инструменты сами спросят токен и покажут форму, если он уже введён.
        if (window.VDVAdminTools) { window.VDVAdminTools.load(); }
    }

    function renderAccounts() {
        var list = C.list();
        box.accounts.innerHTML = '';
        list.forEach(function (acc) {
            var li = document.createElement('li');
            li.className = 'is-ok';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.gap = '0.75rem';

            var name = document.createElement('span');
            name.textContent = acc.login;

            var del = document.createElement('button');
            del.type = 'button';
            del.textContent = list.length > 1 ? 'УДАЛИТЬ' : '—';
            del.disabled = list.length <= 1;
            del.style.cssText = 'background:transparent;border:1px solid var(--border-color);' +
                                'color:var(--text-muted);font-size:.7rem;padding:.25rem .6rem;' +
                                'cursor:' + (list.length > 1 ? 'pointer' : 'not-allowed');
            del.addEventListener('click', function () {
                if (C.remove(acc.login)) { renderAccounts(); }
            });

            li.appendChild(name);
            li.appendChild(del);
            box.accounts.appendChild(li);
        });

        var canAdd = C.hasRoom();
        box.add.hidden = false;
        box.add.querySelector('button[type="submit"]').disabled = !canAdd;
        if (!canAdd) {
            say(box.addMsg, 'Больше ' + C.maxAccounts() + ' записей добавить нельзя.', 'error');
        } else {
            say(box.addMsg, '');
        }
    }

    box.add.addEventListener('submit', function (e) {
        e.preventDefault();
        var login = box.addUser.value.trim();
        var pass = box.addPass.value;
        if (!login) { return say(box.addMsg, REASONS.emptyLogin, 'error'); }
        if (!pass) { return say(box.addMsg, REASONS.emptyPassword, 'error'); }
        C.add(login, pass).then(function (res) {
            if (!res.ok) {
                return say(box.addMsg, REASONS[res.reason] || 'Не удалось добавить.', 'error');
            }
            box.addUser.value = '';
            box.addPass.value = '';
            say(box.addMsg, '', 'ok');
            renderAccounts();
        });
    });

    box.out.addEventListener('click', function () {
        C.endSession();
        view('login');
        box.user.focus();
    });
}());
