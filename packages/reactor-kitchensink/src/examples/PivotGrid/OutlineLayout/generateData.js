let rand = 37;
const companies = ['Google', 'Apple', 'Dell', 'Microsoft', 'Adobe'],
    countries = ['Belgium', 'Netherlands', 'United Kingdom', 'Canada', 'United States', 'Australia'],
    persons = ['John', 'Michael', 'Mary', 'Anne', 'Robert'],
    randomItem = data => {
        const k = rand % data.length;

        rand = rand * 1664525 + 1013904223;
        rand &= 0x7FFFFFFF;
        return data[k];
    },
    randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime() ));

export default function generateData() {
    const data = [];

    for(let i=0; i<500; i++) {
        data.push({
            id:         i,
            company:    randomItem(companies),
            country:    randomItem(countries),
            person:     randomItem(persons),
            date:       randomDate(new Date(2012, 0, 1), new Date()),
            value:      Math.random() * 1000 + 1,
            quantity:   Math.floor(Math.random() * 30 + 1)
        });
    }

    return data;
}