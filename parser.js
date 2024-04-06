const fs = require('fs');
const { MongoClient, ObjectID } = require('mongodb');
const moment = require('moment');
const csv = require('fast-csv');
const url = 'mongodb://localhost:27017';
const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
// ... (The generateJSONSchema function remains unchanged)

function generateJSONSchema(data, customization = {}, prefix = '') {
    const schema = {
        type: 'object',
        properties: {}
    };

    // Custom date validation function
    function validateDate(dateString) {
        const formats = [
            'YYYY-MM-DD',
            'DDMMYYYY',
            // Add more formats as needed
        ];

        for (const format of formats) {
            const parsedDate = moment(dateString, format, true);
            if (parsedDate.isValid()) {
                return true;
            }
        }

        return false;
    }

    for (let key in data) {
        const fieldName = prefix ? `${prefix}${key}` : key;
        const fieldType = typeof data[key];
        const fieldSchema = {};

        const options = customization[fieldName] || {};
        const isRequired = options.required || false;
        const minLength = options.minLength || null;
        const maxLength = options.maxLength || null;
        const dateFormat = options.dateFormat || null;

        if (minLength !== null) {
            fieldSchema.minLength = minLength;
        }

        if (maxLength !== null) {
            fieldSchema.maxLength = maxLength;
        }

        if (isRequired) {
            schema.required = schema.required || [];
            schema.required.push(fieldName);
        }

        if (Array.isArray(data[key])) {
            if (data[key].length > 0 && typeof data[key][0] === 'object') {
                fieldSchema.type = 'array';
                fieldSchema.items = generateJSONSchema(data[key][0], customization, `${fieldName}.`);
            } else {
                fieldSchema.type = 'array';
                fieldSchema.items = { type: typeof data[key][0] };
            }
        } else if (fieldType === 'object') {
            fieldSchema.type = 'object';
            fieldSchema.properties = generateJSONSchema(data[key], customization, `${fieldName}.`).properties;
        } else if (fieldType === 'string') {
            fieldSchema.type = 'string';
            if (dateFormat) {
                fieldSchema.format = dateFormat;
            } else if (validateDate(data[key])) {
                fieldSchema.format = 'date';
            }
        } else if (fieldType === 'number') {
            fieldSchema.type = 'number';
        } else if (fieldType === 'boolean') {
            fieldSchema.type = 'boolean';
        } else if (data[key] instanceof Date) {
            fieldSchema.type = 'string';
            fieldSchema.format = 'date-time';
        }

        schema.properties[fieldName] = fieldSchema;
    }

    return schema;
}

function flattenObject(data, parentKey = '', result = {}) {
    for (const key in data) {
        const newKey = parentKey ? `${parentKey}_${key}` : key;
        if (Array.isArray(data[key])) {
            for (let i = 0; i < data[key].length; i++) {
                flattenObject(data[key][i], `${newKey}_${i}`, result);
            }
        } else if (typeof data[key] === 'object' && data[key] !== null) {
            flattenObject(data[key], newKey, result);
        } else {
            result[newKey] = data[key];
        }
    }
    return result;
}

async function storeInMongoDB(data, dbName) {
    try {
        await client.connect();
        const db = client.db(dbName);

        if (typeof data === 'string') {
            data = JSON.parse(data);
        }

        const dataSchema = generateJSONSchema(data);

        let matchingCollection = await findMatchingCollection(db, dataSchema);

        if (matchingCollection) {
            await updateCollectionData(db, matchingCollection, data);
        } else {
            const newCollectionName = `dynamic_collection_${Date.now()}`.replace(/[.$]/g, '');
            await createAndInsertNewCollection(db, newCollectionName, dataSchema, data);
        }

        const finalCollectionName = matchingCollection ? matchingCollection.collectionName : newCollectionName;
        const exportData = await exportCollectionDataToCSV(db, finalCollectionName);

        const flattenedData = exportData.map(item => flattenObject(item));

        const ws = fs.createWriteStream('output.csv');
        csv.write(flattenedData, { headers: true })
            .pipe(ws)
            .on('finish', () => {
                console.log('CSV file successfully exported.');
            })
            .on('error', (error) => {
                console.error('Error writing CSV:', error);
            });

    } catch (error) {
        console.error('Error storing data in MongoDB:', error);
    } finally {
        await client.close();
    }
}

async function findMatchingCollection(db, dataSchema) {
    const collections = await db.collections();
    for (const collection of collections) {
        const validator = await db.command({ collStats: collection.collectionName }).catch(() => null);
        if (validator && validator.validator && JSON.stringify(validator.validator.$jsonSchema) === JSON.stringify({ $jsonSchema: dataSchema })) {
            return collection;
        }
    }
    return null;
}

async function updateCollectionData(db, collection, data) {
    await collection.replaceOne(
        { _id: data._id || new ObjectID() },
        data,
        { upsert: true }
    );
    console.log(`Inserted or updated document with ID ${data._id || 'generated'} in ${collection.collectionName}`);
}

async function createAndInsertNewCollection(db, newCollectionName, dataSchema, data) {
    await db.createCollection(newCollectionName, {
        validator: { $jsonSchema: dataSchema }
    });
    console.log(`Created new collection: ${newCollectionName}`);
    await db.collection(newCollectionName).insertOne(data);
    console.log(`Inserted document with ID ${data._id || 'generated'} into new collection ${newCollectionName}`);
}

async function exportCollectionDataToCSV(db, collectionName) {
    const cursor = await db.collection(collectionName).find({});
    return await cursor.project({ _id: 0 }).toArray();
}

async function main(inputData) {
    try {
        let parsedData = JSON.parse(JSON.stringify(inputData));
        if (typeof parsedData !== 'object' || parsedData === null) {
            throw new Error('Parsed data is not a valid JSON object');
        }
        await storeInMongoDB(parsedData, 'parser');
    } catch (error) {
        throw new Error('Error while parsing the data');
    }
}

module.exports = {
    main: main
};