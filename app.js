const express = require('express');
const app = express();
const PORT = 3000;
const bodyParser = require('body-parser');
const path = require('path');


const parserService=require('./parser');

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/parseJson', async (req, res) => {
    try {
        const jsonData = req.body.data;

        if (!jsonData || typeof jsonData !== 'string') {
            throw new Error('Invalid JSON data');
        }

        await parserService.main(jsonData);

        const csvFilePath = './output.csv';
        res.download(csvFilePath, 'output.csv');
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});