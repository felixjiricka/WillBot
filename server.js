const express = require('express');
const request = require('request');
const cheerio = require('cheerio');
const moment = require('moment');
const schedule = require('node-schedule');
const mysql = require('mysql');
const app = express();
const isUrl = require('is-url');
const emoji = require('node-emoji');

const Telegraf = require("telegraf"); // import telegraf lib
const Composer = require('telegraf/composer');
const Markup = require("telegraf/markup"); // Get the markup module
const Stage = require("telegraf/stage");
const session = require("telegraf/session");
const WizardScene = require("telegraf/scenes/wizard");
const Keyboard = require('telegraf-keyboard');

const bot = new Telegraf("929421706:AAEvZYMEWZHlq0hH2Le_4ih_zrEvzA4fikw");

const addAgentText = 'Neuen Agenten ' + emoji.get('man_in_tuxedo');
const showAgentText = 'Agenten anzeigen ' + emoji.get('see_no_evil');
const removeAgentText = 'Agenten löschen ' + emoji.get('broken_heart');

const mainMenuKeyboard = new Keyboard();
mainMenuKeyboard
    .add(addAgentText)
    .add(showAgentText, removeAgentText); // second line

bot.start((ctx) => {
    ctx.reply('Hallo!', mainMenuKeyboard.draw())
});
// Currency converter Wizard
const AddEntryScene = new WizardScene(
    "add_botentry",
    ctx => {
        ctx.reply("Wie soll der neue Agent heißen?", mainMenuKeyboard.clear());
        return ctx.wizard.next();
    },
    ctx => {
        ctx.wizard.state.entryname = ctx.message.text;
        ctx.reply(
            `Bitte geben Sie jetzt den Link (inkl. 'http://') zu Ihrem Suchagenten ein:`
        );
        // Go to the following scene
        return ctx.wizard.next();
    },
    ctx => {
        ctx.wizard.state.entrylink = ctx.message.text;

        if (isUrl(ctx.wizard.state.entrylink)) {
            addBotEntry(ctx.wizard.state.entryname, ctx.chat.username, ctx.chat.id, ctx.wizard.state.entrylink)
                .then(() => {
                    ctx.reply(
                        `Fertig! Dein neuer Agent wurde erfolgreich hinzufügt.` +
                        `\n\nAb jetzt wirst du sofort benachrichtigt falls ein neues Produkt gelistet wird.`, mainMenuKeyboard.draw()
                    );
                }).catch((err) => {
                ctx.reply(
                    `Oh nein! Etwas hat nicht so funktioniert wie es sollte. Versuche es noch einmal!`, mainMenuKeyboard.draw()
                );
            });
            return ctx.scene.leave();
        } else {
            ctx.reply(
                `Bitte geben Sie eine gültige URL an.`, mainMenuKeyboard.draw()
            );
            return ctx.scene.leave();
        }
    }
);

const removeEntryScene = new WizardScene(
    "remove_botentry",
    ctx => {
        ctx.reply("Welcher Agent soll entfernt werden? Geben Sie jetzt die ID des Agenten ein:", mainMenuKeyboard.clear());
        return ctx.wizard.next();
    },
    ctx => {
        ctx.wizard.state.toRemove = parseInt(ctx.message.text);

        if (!isNaN(ctx.wizard.state.toRemove)) {
            removeBotEntry(ctx.wizard.state.toRemove, ctx.chat.username).then(() => {
                ctx.reply('Der ausgewählte Agent wurde gelöscht.', mainMenuKeyboard.draw());
            }).catch((err) => {
                ctx.reply(
                    `Oh nein! Etwas hat nicht so funktioniert wie es sollte. Versuche es noch einmal!`, mainMenuKeyboard.draw()
                );
            });
        } else {
            ctx.reply(
                `Oh nein! Etwas hat nicht so funktioniert wie es sollte. Versuche es noch einmal!`, mainMenuKeyboard.draw()
            );
        }

        // Go to the following scene
        return ctx.wizard.next();
    }
);

// Scene registration
const stage = new Stage([AddEntryScene], {
    default: "add_botentry"
});
stage.register(removeEntryScene);

stage.hears('Neuen Agenten', (ctx) => {
    ctx.scene.leave();
    ctx.scene.enter('add_botentry');
});

stage.hears(showAgentText, (ctx) => {
    ctx.scene.leave();
    getUserEntries(ctx.chat.username).then((rows) => {
        let msg = UserEntriesToMessage(rows);
        ctx.reply(msg);
    })
});

stage.hears(removeAgentText, (ctx) => {
    ctx.scene.leave();
    ctx.scene.enter('remove_botentry');
});

stage.hears('abbrechen', (ctx) => {
    ctx.scene.leave();
    ctx.reply('Operation wurde beendet', mainMenuKeyboard.draw());
});
async function sendMail(link, datetime) {
    console.log(link);
    await transporter.sendMail({
        from: '"MadeByFelix" <info@madebyfelix.xyz>', // sender address
        to: 'felixjiricka@outlook.com', // list of receivers
        subject: 'Neues Produkt', // Subject line
        html: `Es ist so eben ein neues Product online gegangen! (${moment(datetime).format('DD.MM.YYYY HH:mm')}) <br> Klicke <a href="${link}">hier.</a>` // html body
    });
}

bot.use(session());
bot.use(stage.middleware());
bot.startPolling();
bot.launch();


// ---------------------------------------------------------------------------------------------------------------------
class BotEntry { //class for all bot entrys, e.g. for iphone x searches
    constructor(id, name, owner, chatID, link, latestProduct) {
        this.id = id;
        this.name = name;
        this.owner = owner;
        this.chatID = chatID;
        this.link = link;
        this.latestProduct = latestProduct;
    }
}
class ProductData { //class for all bot entrys, e.g. for iphone x searches
    constructor(link, datetime) {
        this.link = link;
        this.datetime = datetime;
    }
}

let botEntryData = [];
// SQL Connection
var connection = mysql.createConnection({
    host: 'wwww.madebyfelix.xyz',
    user: 'willbot',
    password: 'Qd6Z$Gj9$$',
    database: 'willbot'
});

connection.connect(function(error) {
    //callback function
    if (!!error) {
        console.log(error);
    } else {
        console.log('Connected to Database.');
        //get all data from tables
        connection.query(`select * from BotEntries`, function(error, rows, fields) {
            if (!!error) {
                console.log("select error");
            } else {
                for (let i = 0; i < rows.length; i++) {
                    botEntryData.push(new BotEntry(rows[i].id, rows[i].name, rows[i].owner, rows[i].chatID, rows[i].willhabenlink, moment(rows[i].latestProduct, 'DD.MM.YYYY HH:mm')));
                }
            }
        });
    }
});

schedule.scheduleJob("*/1 * * * *", function() {
    console.log("schedule");
    for (let i = 0; i < botEntryData.length; i++) {
        sendRequest(botEntryData[i]);
    }
});

function sendRequest(entry) {
    request(entry.link, function(error, response, body) {
        if (error) {
            console.log('error:', error); // Print the error if one occurred
        }

        let data = handleRequestData(body, entry);
        for (let i = 0; i < data.length; i++) {
            console.log("AHHHHH NEW PRODUCT");
            bot.telegram.sendMessage(entry.chatID,
                `Soeben ist ein neues Produkt online gegangen! \n\n` +
                `${data[i]['datetime']}\n` +
                `${data[i]['link']}`
            )
                .catch((error) => {
                    console.log(error);
                });
            sendMail(data[i]['link'], data[i]['datetime']).then().catch((err) => console.log(err));
        }
    });
}

function handleRequestData(body, entry) {
    let $ = cheerio.load(body);
    let productData = [];

    $('#resultlist article[itemscope]').each(function(i, elem) {
        let productLink = "https://www.willhaben.at" + $(elem).find('.header.w-brk > a').attr('href');
        let data = $(elem).find('div:last-child > div');
        let dateTime = moment(data.text().toString().trim(), 'DD.MM.YYYY HH:mm');

        if (moment(entry.latestProduct).isBefore(dateTime)) { //new entry
            console.log("new Element");
            productData.push(new ProductData(productLink, dateTime));
        }
    });

    if (productData.length > 0) {
        //set new latest product
        console.log(`There are ${productData.length} new Products!!`);
        entry.latestProduct = moment.max(productData.map((d) => d.datetime));
        connection.query(`update BotEntries set latestProduct = '${entry.latestProduct.format('DD.MM.YYYY HH:mm')}' where owner = '${entry.owner}' and name = '${entry.name}'`, function(error, rows, fields) {});

    }
    //set new latest product
    if (productData.length > 0) {
        entry.latestProduct = moment.max(productData.map((d) => d.datetime));
        connection.query(`update BotEntries set latestProduct = '${entry.latestProduct.format('DD.MM.YYYY HH:mm')}'`, function(error, rows, fields) {

        });
    }

    console.log(entry.latestProduct.format('DD.MM.YYYY HH:mm'));
    return productData;
}

function removeBotEntry(id, username) {
    return new Promise(((resolve, reject) => {
        connection.query(`delete from BotEntries where id = ${id}`, function(error, rows, fields) {
            if (error) {
                console.log(error);
                reject(error);
            } else {
                //relaod users data
                botEntryData = botEntryData.filter(function(entry) {
                    return entry.owner !== username;
                });

                getUserEntries(username).then((rows) => {
                    for (let i = 0; i < rows.length; i++) {
                        botEntryData.push(new BotEntry(rows[i].id, rows[i].name, rows[i].owner, rows[i].chatID, rows[i].willhabenlink, moment(rows[i].latestProduct, 'DD.MM.YYYY HH:mm')));
                    }
                    resolve(true);
                });
            }
        });
    }))
}

function addBotEntry(name, owner, chatID, link) {
    return new Promise(((resolve, reject) => {
        const tempDate = moment().format('DD.MM.YYYY HH:mm');
        connection.query(`insert into BotEntries(name, owner, chatID, willhabenlink, latestProduct) values('${name}', '${owner}', '${chatID}', '${link}', '${tempDate}')`, function(error, rows, fields) {
            if (error) {
                console.log(error);
                reject(error);
            } else {
                botEntryData.push(new BotEntry(name, owner, link, tempDate));
                resolve(true);
            }
        });
    }))
}

function UserEntriesToMessage(rows) {
    let tempMessageString = "";
    for (let i = 0; i < rows.length; i++) {
        tempMessageString += `${rows[i].name} - ID: ${rows[i].id}\n\n${rows[i].willhabenlink}\n-\n`;
    }
    return tempMessageString;
}

function getUserEntries(owner) {
    return new Promise(((resolve, reject) => {
        connection.query(`select * from BotEntries where owner = '${owner}'`, function(error, rows, fields) {
            if (error) {
                console.log(error);
                reject(error);
            } else {
                resolve(rows);
            }
        });
    }))
}
