const express = require('express');
const request = require('request');
const cheerio = require('cheerio');
const moment = require('moment');
const schedule = require('node-schedule');
const mysql = require('mysql');
const nodemailer = require('nodemailer');
const app = express();

const transporter = nodemailer.createTransport({
    host: 'login-10.hoststar.at',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: 'info@madebyfelix.xyz', // generated ethereal user
        pass: 'Fj230408092017!' // generated ethereal password
    }
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

class BotEntry { //class for all bot entrys, e.g. for iphone x searches
    constructor(id,name, owner, link, latestProduct) {
        this.id = id;
        this.name = name;
        this.owner = owner;
        this.link = link;
        this.latestProduct = latestProduct;
    }

    updateLatestProduct(newDate) {
        this.latestProduct = newDate;
    }
}
class ProductData { //class for all bot entrys, e.g. for iphone x searches
    constructor(link, price, datetime) {
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
connection.connect(function(error){
    //callback function
    if(!!error){
        console.log(error);
    }else{
        console.log('Connected to Database.');
        //get all data from tables
        connection.query(`select * from BotEntries`, function(error, rows, fields){
            if(!!error){
                console.log("select error");
            }else{
                for(let i = 0; i < rows.length; i++) {
                    botEntryData.push(new BotEntry(rows[i].id, rows[i].name, rows[i].owner,rows[i].willhabenlink, moment(rows[i].latestProduct, 'DD.MM.YYYY HH:mm')));
                }
            }
        });
    }
});

schedule.scheduleJob("*/1 * * * *", function() {
    console.log("schedule");
    for(let i = 0; i < botEntryData.length; i++) {
        sendRequest(botEntryData[i]);
    }
});

function sendRequest(entry) {
    request(entry.link, function (error, response, body) {
        if(error) {
            console.log('error:', error); // Print the error if one occurred
        }

        let data = handleRequestData(body, entry);
        for(let i = 0; i < data.length; i++) {
            sendMail(data[i]['link'], data[i]['datetime']);
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

        if(moment(entry.latestProduct).isBefore(dateTime)) { //new entry
            productData.push(new ProductData(productLink, 0, dateTime));
        }
    });

    //set new latest product
    entry.latestProduct = moment.max(productData.map((d) => d.datetime));
    connection.query(`update BotEntries set latestProduct = '${entry.latestProduct.format('DD.MM.YYYY HH:mm')}'`, function(error, rows, fields){

    });

    console.log(entry.latestProduct.format('DD.MM.YYYY HH:mm'));
    return productData;
}
