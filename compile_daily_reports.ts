import fs from "fs-extra";
import parse from "csv-parse";
import glob from "glob";
import path from "path";
import moment from "moment";
import stringify from "csv-stringify";

const START_CONFIRMED_COUNT = 50;
const datafolder = "COVID-19/csse_covid_19_data/csse_covid_19_daily_reports";
const folder = path.join(__dirname, datafolder);
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

type DataPoint = {
    confirmed: number;
    ratio: number;
    habitants: number;
};

const myData: { [country: string]: { [day: number]: DataPoint } } = {};
const population: { [countryName: string]: number } = {};
const countryRemapper: { [countryName: string]: string } = {};
const countryStartDay: { [countryName: string]: number } = {};
const unknownCountries: { [countryName: string]: boolean } = {};
const stringifier = stringify({
    delimiter: ";"
});

const compile = async () => {
    const filenames = await new Promise<string[]>((resolve, reject) => {
        glob(
            `*.csv`,
            { cwd: folder, nodir: true, nocase: true },
            (
                error: any,
                allExistingFiles: string[] | PromiseLike<string[]>
            ) => {
                // files is an array of filenames.
                if (error) {
                    console.log("Failed to find potential extra files");
                    reject(error);
                }
                resolve(allExistingFiles);
            }
        );
    });

    // Already create our output file, so that we can write to it anytime.
    const ws = fs.createWriteStream(path.join(__dirname, "out", "output.csv"));
    // stringifier.on("readable", () => {
    //     const line = stringifier.read() as string;
    //     console.log("Writing: " + typeof line);
    //     ws.write(line);
    // });
    // stringifier.on("error", err => {
    //     console.error(err.message);
    // });
    // stringifier.on("finish", () => {
    //     ws.end();
    //     console.log("Done writing to output file.");
    // });

    // Process the data into our table
    let currentDay = 0;
    for (const name of filenames) {
        const filepath = path.join(folder, name);
        await getFileRecords(filepath, currentDay);
        currentDay += 1;
    }

    // Calculate all ratios
    for (const countryName in myData) {
        for (const day in myData[countryName]) {
            const d = myData[countryName][day];
            d.ratio = (d.confirmed / d.habitants) * 1000;
        }
    }

    console.log("Processed " + currentDay + " days of data");

    // Write header
    const countries = Object.keys(myData).sort();
    // stringifier.write(countries);
    ws.write(countries.join(";") + "\n");

    for (let i = 0; i < currentDay; i += 1) {
        const row: (string | number)[] = [];
        var hasData = false;
        for (const countryName of countries) {
            if (myData[countryName][i]) hasData = true;
            const dayRatio = myData[countryName][i]
                ? myData[countryName][i].ratio
                : "";
            row.push(dayRatio);
        }
        if (!hasData)
            console.warn("Row " + (i + 1) + " doesn't have any data.");
        // stringifier.write(row);

        ws.write(row.join(";") + "\n");
    }
    ws.close();
    // stringifier.end();

    console.log("Demographic data was unavailable for:");
    console.log(unknownCountries);
};

const getFileRecords = async (filepath: string, currentDay: number) => {
    //   const filename = new Date(path.basename(filepath, ".csv"));
    // const day = moment(filename, "MM-DD-YYYY").format("YYYY-MM-DD");
    // Read the content
    const content = await fs.readFile(filepath);
    // Parse the csv content
    const parser = parse(content, { from_line: 2 });
    parser.on("data", record => processRecord(record, currentDay));
};

const processRecord = (record: string[], currentDay: number) => {
    const country = countryRemapper[record[COLUMNS.Country]];
    const habitants = population[country];
    if (!habitants) {
        unknownCountries[record[COLUMNS.Country]] = true;
        return;
    }
    const confirmed = parseInt(record[COLUMNS.Confirmed]);
    // Only start the graph when the contamination has kicked off.
    if (!confirmed || confirmed < START_CONFIRMED_COUNT) return;
    if (!countryStartDay.hasOwnProperty(country))
        countryStartDay[country] = currentDay;
    const dayForCountry = currentDay - countryStartDay[country];
    // Populate my table
    if (!myData[country]) myData[country] = [];
    if (!myData[country][dayForCountry])
        myData[country][dayForCountry] = { confirmed: 0, ratio: 0, habitants };
    myData[country][dayForCountry].confirmed += confirmed;
};

const loadPopulation = async () => {
    const content = await fs.readFile(
        path.join(__dirname, "data", "population.csv")
    );
    return new Promise((resolve, reject) => {
        const parser = parse(content, {}, () => resolve());
        parser.on("data", chunck => {
            //   console.log(JSON.stringify(chunck));
            const country = countryRemapper[chunck[0]];
            if (!country) {
                unknownCountries[chunck[0]] = true;
                return;
            }
            population[country] = parseInt(chunck[1]);
        });
        // parser.on("end", () => resolve())
    });
};

const loadCountryRemapper = async () => {
    const filepath = path.join(__dirname, "data", "country-remapper.csv");
    const content = await fs.readFile(filepath);
    return new Promise((resolve, reject) => {
        const parser = parse(content, {}, () => resolve());
        parser.on("data", (chunck: string[]) => {
            for (const countryName of chunck) {
                countryRemapper[countryName] = chunck[0];
            }
        });
    });
};

const main = async () => {
    await loadCountryRemapper();
    await loadPopulation();
    await compile();
};

main();
