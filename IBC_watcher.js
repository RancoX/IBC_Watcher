import * as cheerio from "cheerio";
import dotenv from "dotenv";
import {generateMailHtml, sendEmail} from "./ranco_auto_gmail.js";
import {readJsonFile, writeJsonFile} from "./jsonHandler.js";
import logger from "./logger.js";

dotenv.config();

const NWEEKS=process.env.NWEEKS;
const IBC_URL = "https://ibcbadminton.yepbooking.com.au/";
const COURT_GROUPS = {
  Outside_4_Courts: ["Mercury", "Venus", "Earth", "Mars"],
  Inside_4_Courts: ["Jupiter", "Saturn", "Uranus", "Neptune"],
};

const get_html = async (year, month, day) => {
  const res = await fetch("https://ibcbadminton.yepbooking.com.au/ajax/ajax.schema.php", {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({
      id_sport: "1",
      day: String(day),
      month: String(month),
      year: String(year),
      event: "datepicker",
    }),
  });

  return await res.text();
};

function extractBookingStatus(htmlText) {
  const $ = cheerio.load(htmlText);

  const table = $("table.schema").first();

  if (!table.length) {
    return {};
  }

  const times = [];

  table.find("thead tr.times td").each((_, td) => {
    times.push($(td).text().trim());
  });

  const result = {};

  table.find('tr[class^="trSchemaLane_"]').each((_, row) => {
    const $row = $(row);

    const laneName = $row.find("th.lineNumber span").first().text().trim();

    if (!laneName) return;

    const bookingStatus = {};
    let timeIndex = 0;

    $row.find("td").each((_, td) => {
      const $td = $(td);

      const colspan = Number($td.attr("colspan") || 1);

      const title =
        $td.attr("title") ||
        $td.find("a").first().attr("title") ||
        $td.find("a").first().attr("aria-label") ||
        "";

      const isBooked =
        $td.hasClass("booked") ||
        title.includes("Booked");

      const isEvent =
        title.includes("EVENT");

      for (let i = 0; i < colspan; i++) {
        const startTime = times[timeIndex];

        if (startTime) {
          bookingStatus[startTime] = {
            title,
            booked: isBooked,
            event: isEvent,
            available: !isBooked && !isEvent,
          };
        }

        timeIndex++;
      }
    });

    result[laneName] = bookingStatus;
  });

  return result;
}


function timeKeyTo24Hour(timeKey) {
  const match = timeKey.match(/^(\d{1,2}):00(am|pm)$/i);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const period = match[2].toLowerCase();

  if (period === "am") {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  return hour;
}

function simplifyBookingStatus24h(bookingStatus, hours) {
  const result = {};

  for (const [courtName, timeBlocks] of Object.entries(bookingStatus)) {
    result[courtName] = {};

    for (const [timeKey, status] of Object.entries(timeBlocks)) {
      const hour24 = timeKeyTo24Hour(timeKey);

      if (hour24 === null) continue;

      if (hours.includes(hour24)) {
        result[courtName][hour24] = status;
      }
    }
  }

  return result;
}

function getCourtsAvailableForAllHours(data, hours = [19, 20]) {
  const availableCourts = [];

  for (const [courtName, timeBlocks] of Object.entries(data)) {
    const isAvailableForAllHours = hours.every((hour) => {
      return timeBlocks[String(hour)]?.available === true;
    });

    if (isAvailableForAllHours) {
      availableCourts.push(courtName);
    }
  }

  return {
    count: availableCourts.length,
    courts: availableCourts,
  };
}

function getAvailableConsecutiveCourtsByGroup(data, hours = [19, 20]) {
  const result = {};

  for (const [groupName, courts] of Object.entries(COURT_GROUPS)) {
    let currentStreak = 0;
    let maxStreak = 0;

    for (const courtName of courts) {
      const timeBlocks = data[courtName];

      const isCourtAvailableForAllHours = hours.every((hour) => {
        return timeBlocks?.[String(hour)]?.available === true;
      });

      if (isCourtAvailableForAllHours) {
        currentStreak += 1;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    result[groupName] = maxStreak;
  }

  return result;
}


function formatGroupName(groupName) {
  return groupName.replaceAll("_", " ");
}

function summarizeAvailableCourts(availableCourts, courtGroups) {
  const availableSet = new Set(availableCourts.courts);

  const summary = Object.entries(courtGroups)
    .map(([groupName, courts]) => {
      const availableInGroup = courts.filter((court) => availableSet.has(court));

      if (availableInGroup.length === 0) {
        return null;
      }

      return `${formatGroupName(groupName)}: ${availableInGroup.join(", ")}`;
    })
    .filter(Boolean)
    .join("\n");

  return `${summary}`;
}


function getSaturdayNWeeksFromToday(nweeks=3) {
  const today = new Date();

  // Add the specified number of weeks
  const target = new Date(today);
  target.setDate(today.getDate() + nweeks * 7);

  // Move to the Saturday of that week
  // Sunday = 0, Monday = 1, ..., Saturday = 6
  const dayOfWeek = target.getDay();
  const daysUntilSaturday = 6 - dayOfWeek;

  target.setDate(target.getDate() + daysUntilSaturday);

  const results = {
    year: target.getFullYear(),
    month: target.getMonth() + 1, // JavaScript months are 0-based
    day: target.getDate(),
  };
  // logger.info(results);
  return results;
}


async function main() {
  const { year, month, day } = getSaturdayNWeeksFromToday(NWEEKS);
  logger.info(`Checking IBC booking status for Sat ${year}-${month}-${day}...`);
  const htmlText = await get_html(year, month, day);
  const bookingStatus = extractBookingStatus(htmlText);
  const simplified = simplifyBookingStatus24h(bookingStatus, [19, 20]);
//   logger.info(JSON.stringify(simplified, null, 2));
  const availableCourts = getCourtsAvailableForAllHours(simplified, [19, 20]);
  const availableGroups = getAvailableConsecutiveCourtsByGroup(simplified, [19, 20]);
  const {Outside_4_Courts,Inside_4_Courts} = availableGroups;
  const courtSummary = summarizeAvailableCourts(availableCourts, COURT_GROUPS);
  logger.info("Available courts:", availableCourts);
  logger.info("Available consecutive courts by group:", availableGroups);

  // check if email has already been sent
  let scoutData = await readJsonFile();
  const entryExists = Object.prototype.hasOwnProperty.call(scoutData, `${year}-${month}-${day}`);
  if (entryExists) {
    logger.info(`Email has already been sent for Sat ${year}-${month}-${day}, following actions skipped.`);
    return;
  }

  if (Outside_4_Courts + Inside_4_Courts <= 7) {
    // generate email content
    const subject = `【BOOK NOW】IBC Booking Status for Sat ${year}-${month}-${day}`;

    const emailContent = `
    <h1 style="color: red;font-weight: bold;">======= BOOK NOW =======</h1>
    <h2>IBC Booking Status for Sat ${year}-${month}-${day}</h2>
    <h2>Available courts for 7-9pm: <span style="color: blue;font-weight: bold;">${availableCourts.count}</span></h2>
    <h3>${courtSummary}</h3>
    <h3>Consecutive available courts by group:</h3>
    <h3>Outside 4 Courts: <span style="color: blue;font-weight: bold;">${Outside_4_Courts}</span></h3>
    <h3>Inside 4 Courts: <span style="color: blue;font-weight: bold;">${Inside_4_Courts}</span></h3>
    <p>Click Here to Book: <a href="${IBC_URL}" target="_blank">IBC Archerfield</a></p>
    `;
    const emailHTML = generateMailHtml(subject,emailContent);
    await sendEmail(emailHTML);

    // update scout log
    const scoutedDate = `${year}-${month}-${day}`;
    const newEntry = {
      availableCourts: availableCourts.courts,
      outside: Outside_4_Courts,
      inside: Inside_4_Courts,
      notifiedAt: new Date().toISOString(),
    }
    scoutData[scoutedDate] = newEntry;
    await writeJsonFile(scoutData);
    logger.info(`Scout log updated with entry: ${JSON.stringify(newEntry)} for ${scoutedDate}`);
    return
  }
  logger.info(`No need to send email, available courts are sufficient.${availableCourts.count} (${courtSummary})`);
}

main().catch(console.error);