const express = require('express');
const app = express();
const PORT = 3000;
const parserService=require('./parser');
app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    parserService.main();
});
