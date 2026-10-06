/**
 * Адреса, по которым сайт читает и пишет данные.
 *
 * Здесь нет и не должно быть ни паролей, ни токенов. Токен спрашивается
 * у человека в окне входа и живёт только в памяти вкладки, поэтому в файл
 * репозитория он не попадает.
 *
 * Перед публикацией заказчику вписать свой репозиторий: в GitHub это
 * «владелец/имя-репозитория» из адресной строки страницы репозитория.
 */
(function (global) {
    'use strict';

    global.VDV_CONFIG = {
        repo: {
            owner: 'ЗАПОЛНИТЬ',      // например VDV-ishim
            name: 'ЗАПОЛНИТЬ',       // например sdr-ischim-union
            branch: 'main',
            api: 'https://api.github.com'
        },

        // Пути внутри репозитория. Меняются только если файлы переедут.
        files: {
            settings: 'data/site.json',
            news: 'data/vk_posts.json',
            photos: 'photos'
        },

        // Код формы formspree.io: https://formspree.io/f/XXXXXXXX
        // Пока не вписан, сайт собирает письмо и открывает почту.
        formspree: 'XXXXXXXX',

        vk: {
            group: 'vdvishim',
            apiVersion: '5.131'
        },

        // Оригинальная ширина, до которой админка сжимает загруженное фото.
        photo: {
            maxWidth: 1400,
            quality: 0.82
        }
    };
}(window));
