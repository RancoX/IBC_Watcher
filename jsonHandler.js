import fs from 'fs/promises';
import path from 'path';
import logger from "./logger.js";

const FILE_PATH = path.join(import.meta.dirname, './scout_log.json');

async function readJsonFile() {
    try {
        const data_bin = await fs.readFile(FILE_PATH, 'utf-8');
        const jsonData = JSON.parse(data_bin);
        logger.debug("JSON data read successfully:", jsonData);
        return jsonData;
    } catch (err) {
        logger.error("Error reading JSON file:", err);
    }
}

async function writeJsonFile(data) {
    try {
        await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 4), 'utf-8');
        logger.debug("JSON data written successfully.");
    } catch (err) {
        logger.error("Error writing JSON file:", err);
    }
}

export { readJsonFile, writeJsonFile };