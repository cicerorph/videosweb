const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const token = crypto.randomBytes(8).toString('hex');
const conf = require('./config.json')

console.log(token)

const {Webhook} = require('simple-discord-webhooks');

const webhook = new Webhook(conf.WEBHOOK);

webhook.send(`**I GOT RESTARTED**\nPermanent Token: ${token}`)

const singleTokens = [];
Array.prototype.randoms = function () {
    const result = [...this];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result.slice(0, 3);
}
const extractFrames = require('ffmpeg-extract-frames')
const app = express();
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the current directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');

const upload = multer({
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB file size limit
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith("video/")) {
            return cb(new Error('You need to upload a video matey'))
        }
        cb(null, true)
    },
    if(){

    },
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'uploads/'); // Set the destination folder for uploaded videos
        },
        filename: (req, file, cb) => {
            const randomHash = crypto.randomBytes(8).toString('hex'); // Generate a random hash for the filename
            const ext = path.extname(file.originalname);
            cb(null, randomHash + ext); // Set the filename to the random hash + original file extension
        },
    }),
});

app.post('/upload', upload.single('video'), async(req, res) => {
    const videoPath = '/uploads/' + req.file.filename;
    if (req.body.token !== token) {
        if(singleTokens.includes(req.body.token)){
            var indexToRemove = singleTokens.findIndex(function(item) {
                return item === token;
            });
            singleTokens.splice(indexToRemove, 1);
        }else{
            fs.unlinkSync("." + videoPath)
            return res.status(403).send('Invalid token');
        }
    }
    await extractFrames({
        input: "./" + videoPath,
        output: "./" + videoPath + ".png",
        offsets: [
          0,
        ]
    });
    // Read the videos.json file
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    videos.push({ id: req.file.filename, path: videoPath, thumbnail: videoPath + ".png", title: sanitizeHtml(req.body.title), description: sanitizeHtml(req.body.description).replace("\\r\\n", "\\n") });
    fs.writeFileSync('./videos.json', JSON.stringify(videos));

    res.redirect('/videos/' + req.file.filename);

    webhook.send(`**An video got uploaded**\nLink: [CLICK HERE](https://videos.mubi.tech/videos/${req.file.filename})`)
});

app.get('/upload', (req, res) => {
    res.render('upload');
});

app.get('/videos', (req, res) => {
    // Read the videos.json file
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    res.render('videos', { videos: videos });
});

app.get('/', (req, res) => {
    // Read the videos.json file
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    res.render('videos', { videos: videos });
});

app.get('/videos/:id', (req, res, next) => {
    // Read the videos.json file
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    const videoIndex = videos.findIndex(video => video.id === req.params.id);
    if (videoIndex !== -1) {
        const video = videos[videoIndex];
        videos.splice(videoIndex, 1);
        res.render('watchvideo', { video: video, videos: videos.randoms() });
    } else {
        next();
    }
});

app.get('/generateToken', (req, res) => {
    if(req.query.token !== token){
        return res.send("invalid token")
    }
    let generatedToken = crypto.randomBytes(8).toString('hex');
    singleTokens.push(generatedToken)
    res.send(generatedToken)
});

app.use((req, res) => {
    res.status(404).render('error');
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
