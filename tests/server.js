const express = require('express')
const app = express()

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(__dirname + '/test.html'));

app.listen(3000, () => console.log('Running on port: 3000!'))