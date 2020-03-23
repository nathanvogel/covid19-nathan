"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = __importDefault(require("fs-extra"));
const csv_parse_1 = __importDefault(require("csv-parse"));
const glob_1 = __importDefault(require("glob"));
const path_1 = __importDefault(require("path"));
const csv_stringify_1 = __importDefault(require("csv-stringify"));
const START_CONFIRMED_COUNT = 25;
const datafolder = "COVID-19/csse_covid_19_data/csse_covid_19_daily_reports";
const folder = path_1.default.join(__dirname, datafolder);
const COLUMNS = {
    State: 0,
    Country: 1,
    LastUpdate: 2,
    Confirmed: 3,
    Deaths: 4,
    Recovered: 5,
    Latitude: 6,
    Longitude: 7
};
const myData = {};
const population = {};
const countryRemapper = {};
const countryStartDay = {};
const unknownCountries = {};
const stringifier = csv_stringify_1.default({
    delimiter: ";"
});
const compile = () => __awaiter(void 0, void 0, void 0, function* () {
    const filenames = yield new Promise((resolve, reject) => {
        glob_1.default(`*.csv`, { cwd: folder, nodir: true, nocase: true }, (error, allExistingFiles) => {
            // files is an array of filenames.
            if (error) {
                console.log("Failed to find potential extra files");
                reject(error);
            }
            resolve(allExistingFiles);
        });
    });
    // Already create our output file, so that we can write to it anytime.
    const ws = fs_extra_1.default.createWriteStream(path_1.default.join(__dirname, "out", "output.csv"));
    // Process the data into our table
    let currentDay = 0;
    for (const name of filenames) {
        const filepath = path_1.default.join(folder, name);
        yield getFileRecords(filepath, currentDay);
        currentDay += 1;
    }
    // Calculate all ratios
    for (const countryName in myData) {
        for (const day in myData[countryName]) {
            const d = myData[countryName][day];
            d.ratio = (d.confirmed / d.habitants) * 1000;
        }
    }
    console.log("Processed " + currentDay + " days of data.");
    // Write header
    const countries = Object.keys(population).sort();
    ws.write(countries.join(";") + "\n");
    for (let i = 0; i < currentDay; i += 1) {
        const row = [];
        var hasData = false;
        for (const countryName of countries) {
            if (myData[countryName] && myData[countryName][i])
                hasData = true;
            const dayRatio = myData[countryName] && myData[countryName][i]
                ? myData[countryName][i].ratio
                : "";
            row.push(dayRatio);
        }
        if (!hasData)
            console.warn("Row " + (i + 1) + " doesn't have any data.");
        ws.write(row.join(";") + "\n");
    }
    ws.close();
    console.log("Demographic data was unavailable for:");
    console.log(unknownCountries);
});
const getFileRecords = (filepath, currentDay) => __awaiter(void 0, void 0, void 0, function* () {
    //   const filename = new Date(path.basename(filepath, ".csv"));
    // const day = moment(filename, "MM-DD-YYYY").format("YYYY-MM-DD");
    // Read the content
    const content = yield fs_extra_1.default.readFile(filepath);
    // Parse the csv content
    const parser = csv_parse_1.default(content, { from_line: 2 });
    parser.on("data", record => processRecord(record, currentDay));
});
const processRecord = (record, currentDay) => {
    const country = countryRemapper[record[COLUMNS.Country]];
    const habitants = population[country];
    if (!habitants) {
        unknownCountries[record[COLUMNS.Country]] = true;
        return;
    }
    const confirmed = parseInt(record[COLUMNS.Confirmed]);
    // Only start the graph when the contamination has kicked off.
    if (!confirmed || confirmed < START_CONFIRMED_COUNT)
        return;
    if (!countryStartDay.hasOwnProperty(country))
        countryStartDay[country] = currentDay;
    const dayForCountry = currentDay - countryStartDay[country];
    // Populate my table
    if (!myData[country])
        myData[country] = [];
    if (!myData[country][dayForCountry])
        myData[country][dayForCountry] = { confirmed: 0, ratio: 0, habitants };
    myData[country][dayForCountry].confirmed += confirmed;
};
const loadPopulation = () => __awaiter(void 0, void 0, void 0, function* () {
    const content = yield fs_extra_1.default.readFile(path_1.default.join(__dirname, "data", "population.csv"));
    return new Promise((resolve, reject) => {
        const parser = csv_parse_1.default(content, {}, () => resolve());
        parser.on("data", chunck => {
            const country = countryRemapper[chunck[0]];
            if (!country) {
                unknownCountries[chunck[0]] = true;
                return;
            }
            population[country] = parseInt(chunck[1]);
        });
        // parser.on("end", () => resolve())
    });
});
const loadCountryRemapper = () => __awaiter(void 0, void 0, void 0, function* () {
    const filepath = path_1.default.join(__dirname, "data", "country-remapper.csv");
    const content = yield fs_extra_1.default.readFile(filepath);
    return new Promise((resolve, reject) => {
        const parser = csv_parse_1.default(content, {}, () => resolve());
        parser.on("data", (chunck) => {
            for (const countryName of chunck) {
                countryRemapper[countryName] = chunck[0];
            }
        });
    });
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    yield loadCountryRemapper();
    yield loadPopulation();
    yield compile();
});
main();
//# sourceMappingURL=compile_daily_reports.js.map