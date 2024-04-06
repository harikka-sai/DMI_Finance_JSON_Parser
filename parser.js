const fs = require('fs');
const { MongoClient } = require('mongodb');

function parse(input) {
    let currentIndex = 0;

    function getToken() {
        const char = input[currentIndex];

        while (char && /\s/.test(char)) {
            currentIndex++;
        }

        if (!char) {
            return null; // End of string
        }

        if (char === '{' || char === '[') {
            return { type: 'objectStart' };
        }

        if (char === '}' || char === ']') {
            return { type: 'objectEnd' };
        }

        if (char === '"') {
            let value = '';
            currentIndex++; // Skip opening quote
            while (input[currentIndex] !== '"') {
                value += input[currentIndex];
                currentIndex++;
            }
            currentIndex++; // Skip closing quote
            return { type: 'string', value };
        }

        if (char === '<') {
            return { type: 'xmlTagStart' };
        }

        if (char === '>') {
            return { type: 'xmlTagEnd' };
        }

        if (/^-?\d+(\.\d+)?/.test(input.substring(currentIndex))) {
            const value = parseFloat(input.substring(currentIndex));
            currentIndex += value.toString().length;
            return { type: 'number', value };
        }

        if (input.startsWith('true', currentIndex)) {
            currentIndex += 4;
            return { type: 'boolean', value: true };
        }

        if (input.startsWith('false', currentIndex)) {
            currentIndex += 5;
            return { type: 'boolean', value: false };
        }

        if (input.startsWith('null', currentIndex)) {
            currentIndex += 4;
            return { type: 'null', value: null };
        }

        throw new Error('Invalid input');
    }

    function parseObject() {
        const obj = {};
        let token = getToken();

        while (token && token.type !== 'objectEnd') {
            if (token.type !== 'string') {
                throw new Error('Invalid object key');
            }
            const key = token.value;
            token = getToken(); // Consume colon
            if (token.type !== 'xmlTagStart' && token.type !== 'objectStart') {
                throw new Error('Expected colon after object key');
            }
            token = getToken(); // Consume value
            obj[key] = parseValue(token);
            token = getToken(); // Consume comma or objectEnd
        }

        return obj;
    }

    function parseArray() {
        const arr = [];
        let token = getToken();

        while (token && token.type !== 'objectEnd') {
            arr.push(parseValue(token));
            token = getToken(); // Consume comma or objectEnd
        }

        return arr;
    }

    function parseValue(token) {
        switch (token.type) {
            case 'string':
            case 'number':
            case 'boolean':
            case 'null':
                return token.value;
            case 'objectStart':
                return parseObject();
            case 'xmlTagStart':
                return parseXML();
            default:
                throw new Error('Unexpected token');
        }
    }

    function parseXML() {
        const obj = {};
        let token = getToken();

        while (token && token.type !== 'xmlTagEnd') {
            if (token.type !== 'string') {
                throw new Error('Invalid XML tag name');
            }
            const key = token.value;
            token = getToken(); // Consume closing angle bracket or attribute name
            if (token.type === 'string') {
                const value = token.value;
                obj[key] = value;
                token = getToken(); // Consume closing angle bracket or attribute name
            } else if (token.type === 'xmlTagStart') {
                obj[key] = parseXML();
                token = getToken(); // Consume closing angle bracket
            } else {
                throw new Error('Invalid XML content');
            }
        }

        return obj;
    }

    return parseValue(getToken());
}

async function storeInMongoDB(data, dbName, collectionName) {
    const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Insert data into MongoDB
        const result = await collection.insertOne(data);
        console.log(`Inserted document with ID ${result.insertedId} into MongoDB`);

    } catch (error) {
        console.error('Error storing data in MongoDB:', error);
    } finally {
        await client.close();
    }
}

// Main function
async function main() {
    try {
        // Read input data from file
        const inputData = fs.readFileSync('input.json', 'utf-8');

        // Parse input data"{\n  \"name\":\"shalu\",\n  \"role\":\"xyz\"\n}"
        // const parsedData = parse(inputData);
        const parsedData=JSON.parse(inputData);

        // Store parsed data in MongoDB
        await storeInMongoDB(parsedData, 'parser', 'json_metadata');

    } catch (error) {
        console.error('Error:', error);
    }
}

// Execute main function
module.exports={
    main:main
}