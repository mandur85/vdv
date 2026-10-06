/**
 * Учётные данные админки на чистом клиенте: без сервера и без сети.
 *
 * Важно понимать честно: это не настоящая защита. Любой посетитель может
 * открыть исходники и посмотреть, как устроена проверка. Задача модуля —
 * скрыть админку от обычного посетителя, а не оружить её от determined
 * атакующего. Пароли здесь никогда не хранятся открытым текстом.
 */
(function (global) {
    'use strict';

    var KEY = 'vdv.accounts';
    var SESSION = 'vdv.session';
    var MAX_ACCOUNTS = 3;
    var SESSION_MS = 60 * 60 * 1000;
    var MAX_ATTEMPTS = 5;
    var LOCK_MS = 30 * 1000;

    // Правила пароля. Держим их здесь, чтобы форма и модальное окно проверяли
    // одно и то же, а правило нельзя было случайно ослабить в двух местах.
    var MIN_PASSWORD = 10;
    var MAX_PASSWORD = 64;
    var PASSWORD_CHARS = /^[A-Za-z0-9.!?_]+$/;

    // ---------------------------------------------------------------- sha256

    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
        0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
        0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function utf8Bytes(str) {
        var bytes = [], i, code;
        for (i = 0; i < str.length; i++) {
            code = str.charCodeAt(i);
            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
            } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
                var next = str.charCodeAt(i + 1);
                code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                i++;
                bytes.push(
                    0xf0 | (code >> 18),
                    0x80 | ((code >> 12) & 63),
                    0x80 | ((code >> 6) & 63),
                    0x80 | (code & 63)
                );
            } else {
                bytes.push(
                    0xe0 | (code >> 12),
                    0x80 | ((code >> 6) & 63),
                    0x80 | (code & 63)
                );
            }
        }
        return bytes;
    }

    function sha256(text) {
        var bytes = utf8Bytes(text);
        var bits = bytes.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) {
            bytes.push(0);
        }
        for (var i = 7; i >= 0; i--) {
            bytes.push(Math.floor(bits / Math.pow(2, i * 8)) & 0xff);
        }

        var h = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];
        var w = new Array(64);
        var r, a, b, c, d, e, f, g, hh, t1, t2, s0, s1, ch, maj;

        for (var off = 0; off < bytes.length; off += 64) {
            for (i = 0; i < 16; i++) {
                w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) |
                       (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
            }
            for (i = 16; i < 64; i++) {
                var w15 = w[i - 15], w2 = w[i - 2];
                s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
                s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }

            a = h[0]; b = h[1]; c = h[2]; d = h[3];
            e = h[4]; f = h[5]; g = h[6]; hh = h[7];

            for (i = 0; i < 64; i++) {
                s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
                ch = ((e & f) ^ (~e & g)) >>> 0;
                t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
                s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
                maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
                t2 = (s0 + maj) >>> 0;
                hh = g; g = f; f = e;
                e = (d + t1) >>> 0;
                d = c; c = b; b = a;
                a = (t1 + t2) >>> 0;
            }

            h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
            h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
            h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
            h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
        }

        r = '';
        for (i = 0; i < 8; i++) {
            r += ('00000000' + h[i].toString(16)).slice(-8);
        }
        return r;
    }

    function rotr(x, n) {
        return ((x >>> n) | (x << (32 - n))) >>> 0;
    }

    // ------------------------------------------------------------- хранилище

    function read() {
        try {
            var raw = global.localStorage.getItem(KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function write(list) {
        try {
            global.localStorage.setItem(KEY, JSON.stringify(list));
            return true;
        } catch (e) {
            return false;
        }
    }

    function randomSalt() {
        var s = '';
        if (global.crypto && global.crypto.getRandomValues) {
            var buf = new Uint8Array(8);
            global.crypto.getRandomValues(buf);
            for (var i = 0; i < buf.length; i++) {
                s += ('0' + buf[i].toString(16)).slice(-2);
            }
            return s;
        }
        return String(Date.now()) + Math.floor(Math.random() * 1e9).toString(16);
    }

    function hashOf(password, salt) {
        return sha256(salt + ':' + password);
    }

    function same(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
            return false;
        }
        var diff = 0;
        for (var i = 0; i < a.length; i++) {
            diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return diff === 0;
    }

    // --------------------------------------------------------- попытки входа

    function attempts() {
        try {
            var raw = global.sessionStorage.getItem('vdv.attempts');
            var data = raw ? JSON.parse(raw) : { n: 0, until: 0 };
            return data;
        } catch (e) {
            return { n: 0, until: 0 };
        }
    }

    function saveAttempts(data) {
        try {
            global.sessionStorage.setItem('vdv.attempts', JSON.stringify(data));
        } catch (e) { /* без хранилища просто не будет блокировки */ }
    }

    function locked() {
        var a = attempts();
        if (a.until > Date.now()) {
            return Math.ceil((a.until - Date.now()) / 1000);
        }
        return 0;
    }

    function fail() {
        var a = attempts();
        a.n = (a.n || 0) + 1;
        if (a.n >= MAX_ATTEMPTS) {
            a.until = Date.now() + LOCK_MS;
            a.n = 0;
        }
        saveAttempts(a);
    }

    function clearAttempts() {
        saveAttempts({ n: 0, until: 0 });
    }

    // ------------------------------------------------- проверка пароля

    /**
     * Проверяет пароль по правилам ниже и возвращает код первой неудачи.
     * Разрешены только латинские буквы, цифры и символы . ! ? _
     * Кириллица, пробелы и любые другие знаки отклоняются.
     *
     *   не короче MIN_PASSWORD символов
     *   не длиннее MAX_PASSWORD символов
     *   только допустимые символы
     *   есть хотя бы одна цифра
     *   есть хотя бы один символ . ! ? _
     */
    function validatePassword(password) {
        var value = typeof password === 'string' ? password : '';
        if (!value) {
            return { ok: false, code: 'emptyPassword' };
        }
        if (value.length < MIN_PASSWORD) {
            return { ok: false, code: 'short' };
        }
        if (value.length > MAX_PASSWORD) {
            return { ok: false, code: 'long' };
        }
        if (!PASSWORD_CHARS.test(value)) {
            return { ok: false, code: 'chars' };
        }
        if (!/[0-9]/.test(value)) {
            return { ok: false, code: 'digit' };
        }
        if (!/[.!?_]/.test(value)) {
            return { ok: false, code: 'symbol' };
        }
        return { ok: true, code: '' };
    }

    // ---------------------------------------------------------------- API

    /**
     * Проверяет логин и пароль. secretPassword и secretEmail — два поля,
     * войти можно любым из них.
     */
    function verify(login, secretPassword, secretEmail) {
        var wait = locked();
        if (wait > 0) {
            return Promise.resolve({ ok: false, reason: 'locked', seconds: wait });
        }

        var list = read();
        var candidates = [secretPassword, secretEmail].filter(function (v) {
            return typeof v === 'string' && v.length > 0;
        });
        if (!list.length || !candidates.length) {
            return Promise.resolve({ ok: false, reason: 'empty' });
        }

        var acc = null;
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].login).toLowerCase() === String(login || '').trim().toLowerCase()) {
                acc = list[i];
                break;
            }
        }
        if (!acc) {
            fail();
            return Promise.resolve({ ok: false, reason: 'wrong' });
        }

        for (var j = 0; j < candidates.length; j++) {
            if (same(hashOf(candidates[j], acc.salt), acc.hash)) {
                clearAttempts();
                return Promise.resolve({ ok: true, login: acc.login });
            }
        }
        fail();
        return Promise.resolve({ ok: false, reason: 'wrong' });
    }

    function list() {
        return read().map(function (a) {
            return { login: a.login };
        });
    }

    function hasRoom() {
        return read().length < MAX_ACCOUNTS;
    }

    function maxAccounts() {
        return MAX_ACCOUNTS;
    }

    function save(oldLogin, newLogin, newPassword) {
        var accounts = read();
        var idx = -1;
        for (var i = 0; i < accounts.length; i++) {
            if (String(accounts[i].login).toLowerCase() === String(oldLogin).toLowerCase()) {
                idx = i;
                break;
            }
        }
        if (idx < 0) {
            return Promise.resolve({ ok: false, reason: 'missing' });
        }

        var login = String(newLogin || '').trim();
        if (!login) {
            return Promise.resolve({ ok: false, reason: 'emptyLogin' });
        }
        for (i = 0; i < accounts.length; i++) {
            if (i !== idx && String(accounts[i].login).toLowerCase() === login.toLowerCase()) {
                return Promise.resolve({ ok: false, reason: 'taken' });
            }
        }
        if (!newPassword) {
            return Promise.resolve({ ok: false, reason: 'emptyPassword' });
        }
        var pw = validatePassword(newPassword);
        if (!pw.ok) {
            return Promise.resolve({ ok: false, reason: pw.code });
        }

        var salt = randomSalt();
        accounts[idx] = { login: login, salt: salt, hash: hashOf(newPassword, salt) };
        if (!write(accounts)) {
            return Promise.resolve({ ok: false, reason: 'storage' });
        }
        return Promise.resolve({ ok: true, login: login });
    }

    function add(newLogin, newPassword) {
        if (!hasRoom()) {
            return Promise.resolve({ ok: false, reason: 'full' });
        }
        var login = String(newLogin || '').trim();
        if (!login) {
            return Promise.resolve({ ok: false, reason: 'emptyLogin' });
        }
        var pw = validatePassword(newPassword);
        if (!pw.ok) {
            return Promise.resolve({ ok: false, reason: pw.code });
        }
        var accounts = read();
        for (var i = 0; i < accounts.length; i++) {
            if (String(accounts[i].login).toLowerCase() === login.toLowerCase()) {
                return Promise.resolve({ ok: false, reason: 'taken' });
            }
        }
        var salt = randomSalt();
        accounts.push({ login: login, salt: salt, hash: hashOf(newPassword, salt) });
        if (!write(accounts)) {
            return Promise.resolve({ ok: false, reason: 'storage' });
        }
        return Promise.resolve({ ok: true, login: login });
    }

    function remove(login) {
        var accounts = read();
        var kept = accounts.filter(function (a) {
            return String(a.login).toLowerCase() !== String(login).toLowerCase();
        });
        if (kept.length === accounts.length) {
            return false;
        }
        if (!kept.length) {
            return false;          // последнюю учётку удалять нельзя
        }
        write(kept);
        return true;
    }

    function startSession(login) {
        try {
            global.sessionStorage.setItem(SESSION, JSON.stringify({
                login: login, until: Date.now() + SESSION_MS
            }));
        } catch (e) { /* сессия просто не переживёт перезагрузку */ }
    }

    function session() {
        try {
            var raw = global.sessionStorage.getItem(SESSION);
            var data = raw ? JSON.parse(raw) : null;
            if (data && data.until > Date.now()) {
                return data.login;
            }
        } catch (e) { /* нет сессии */ }
        return null;
    }

    function endSession() {
        try {
            global.sessionStorage.removeItem(SESSION);
        } catch (e) { /* уже нет сессии */ }
    }

    global.Credentials = {
        verify: verify,
        list: list,
        add: add,
        save: save,
        remove: remove,
        hasRoom: hasRoom,
        maxAccounts: maxAccounts,
        validatePassword: validatePassword,
        minPasswordLength: function () { return MIN_PASSWORD; },
        maxPasswordLength: function () { return MAX_PASSWORD; },
        session: session,
        startSession: startSession,
        endSession: endSession,
        _sha256: sha256
    };
}(typeof window !== 'undefined' ? window : this));
