console.log(require('dotenv').config());
const cheerio = require('cheerio');
const _ = require('lodash');
const moment = require('moment');
const tz = require('moment-timezone')
const express = require('express');

const Browser = require('zombie');
let browser = new Browser();

var app = express();
var port = process.env.PORT || 8432;

const username = process.env.username;
const password = process.env.password;

let bookingUrl = "http://ntuitive.sg/booking/my-bookings/bookings?start=";

var startCount = 0;

function getCurrentDate() {
    var currentDate = moment(new Date());
    var localDate = currentDate.tz('Asia/Singapore').format('DD MMM YYYY hh:mm:ss a');
    return localDate;
}

function getCurrentMonth() {
    var currentDate = moment(new Date());
    var localMonth = currentDate.tz('Asia/Singapore').format('MM');
    return parseInt(localMonth, 10) - 1;
}

var currentMonth = getCurrentMonth();
var prevMonth = (getCurrentMonth() - 1) % 12;
var hours = 0;
var bookings = [];
var prevhours = 0;
var prevbookings = [];
var pagesSearched = 0;

var lastUpdated;
var currData = "Try again";
var prevData = "Try again";
var isRunning = false;

function resetVars() {
    isRunning = true;
    startCount = 0;
    hours = 0;
    bookings = [];
    prevhours = 0;
    prevbookings = [];
    pagesSearched = 0;
    currentMonth = getCurrentMonth();
    prevMonth = (getCurrentMonth() - 1) % 12;
}

app.get('/', function (request, response) {
    response.send('Last Updated: ' + lastUpdated + '\n' + currData);
    crawl();
});

app.get('/prevmonth', function (request, response) {
    response.send('Last Updated: ' + lastUpdated + '\n' + prevData);
    crawl();
});

app.listen(port, () => {
    console.log('\n===================\n Port:%s Ready!\n===================', port);
});

app.on('connection', function (socket) {
    console.log("A new connection was made by a client.");
    socket.setTimeout(30 * 1000);
})

crawl() // crawl once first
setTimeout(function () {
    crawl();
}, 3 * 60 * 60 * 1000); // every 3 hours

function crawl() {
    if (!isRunning) {
        resetVars();
        visitPage();
    }
    lastUpdated = getCurrentDate();
}

function visitPage() {
    browser.visit(bookingUrl + startCount, function (err) {
        console.log(browser.url);
        if (!err && browser.query('#username-lbl')) {
            login(searchNextPage);
        } else {
            searchNextPage();
        }
    });
}

function login(done) {
    browser
        .fill('username', username)
        .fill('password', password)
        .pressButton('Log in', done);
}

function printPage() {
    console.log(browser.html('body'));
}

function searchNextPage() {
    pagesSearched++;
    let shouldContinue = parse(browser.html('body'));
    console.log('should continue? ', shouldContinue);
    if (shouldContinue && pagesSearched < 5) {
        startCount += 10;
        visitPage();
    } else {
        currData = "This Month\n==========\nHours Used: " + hours + '\r\n' + "Bookings: \r\n" + _.join(bookings, '\r\n');
        prevData = "Last Month\n==========\nHours Used: " + prevhours + '\r\n' + "Bookings: \r\n" + _.join(prevbookings, '\r\n');
        console.log(currData);
        console.log(prevData);
        isRunning = false;
    }
}

function parse(html) {
    let $ = cheerio.load(html);
    let shouldContinue = true;
    $('span.fly-date').each(function (i, element) {
        //   var a = $(this).prev();
        let date = ($(this).text());
        let td = $(this).parent();
        if (date && new Date(date).getMonth() === currentMonth) {
            let timeslottd = td.next();
            if (timeslottd) {
                let timeslot = (timeslottd.text());
                // status td
                let statustd = td.next().next();
                if (statustd) {
                    let statusspan = statustd.children('span.room-pending');
                    if (statusspan) {
                        let approval = statusspan.text();
                        if (approval === 'Approved') {
                            hours += getHoursUsed(timeslot);
                            bookings.push(date.trim() + ' at ' + timeslot.trim());
                        }
                    }
                }
            }
        } else if (date && new Date(date).getMonth() === prevMonth) {
            let timeslottd = td.next();
            if (timeslottd) {
                let timeslot = (timeslottd.text());
                // status td
                let statustd = td.next().next();
                if (statustd) {
                    let statusspan = statustd.children('span.room-pending');
                    if (statusspan) {
                        let approval = statusspan.text();
                        if (approval === 'Approved') {
                            prevhours += getHoursUsed(timeslot);
                            prevbookings.push(date.trim() + ' at ' + timeslot.trim());
                        }
                    }
                }
            }
        } else if (date && new Date(date).getMonth() < prevMonth) {
            shouldContinue = false;
        }
    });
    return shouldContinue;
}

function getHoursUsed(timeslot) {
    var times = _.split(timeslot, '-');
    if (times.length == 2) {
        let end = moment(times[1], 'hh:mm AA')
        let start = moment(times[0], 'hh:mm AA');
        let duration = (end - start) / 1000 / 60 / 60;
        return duration;
    }
    return 0;
}