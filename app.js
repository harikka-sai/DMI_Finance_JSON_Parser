const express = require('express');
const app = express();
const PORT = 3000;
const bodyParser = require('body-parser');

const parserService=require('./parser');

app.use(bodyParser.json());

app.post('/parseJson', async (req, res) => {
    try {
        // Convert JSON to CSV
        await parserService.main(req.body);
        // Create CSV file
        const csvFilePath = './output.csv';
        // Return CSV file as a response
        res.download(csvFilePath, 'output.csv');
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});