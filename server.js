`use strict`

const express = require('express');
const process = require(`process`)
const fs = require('fs')
const child_process = require(`child_process`)
const moment = require(`moment`)

let mp3OutputStreams = []
let activeStreamingConnections = 0
let lastTimeDataReceived = moment()

let shairportSyncPCMInputStream = {}
let shairportSyncPCMInputStreamError = null

async function startInputStreamLoop() {
    shairportSyncPCMInputStream = fs.createReadStream(process.env.PIPE_PATH || `/tmp/shairport-sync-audio`)

    shairportSyncPCMInputStream.on(`error`, async function (err) {
        shairportSyncPCMInputStreamError = err
        await new Promise(resolve => setTimeout(resolve, 100))
        startInputStreamLoop()
    })

    shairportSyncPCMInputStream.on(`open`, function() {
        console.debug(`Shairport-Sync PCM input stream is opened.`)
        shairportSyncPCMInputStreamError = null
    })


    shairportSyncPCMInputStream.on(`ready`, function () {
        console.debug(`Shairport-Sync PCM input stream is ready.`)
        shairportSyncPCMInputStreamError = null
    })
}
startInputStreamLoop()


const ffmpeg = child_process.spawn(`ffmpeg`, [
    `-f`, `s16le`,
    `-ar`, `44100`,
    `-ac`, `2`,
    `-i`, `pipe:0`,
    `-f`, `mp3`,
    `-codec:a`, `libmp3lame`,
    `-b:a`, `320k`,
    `-compression_level`, `0`,
    `pipe:1`
], {stdio: ['pipe', 'pipe', 'ignore']})

ffmpeg.on(`spawn`, () => {
    console.info(`ffmpeg spawned successfully.`)
})
ffmpeg.on(`exit`, (code, signal) => {
    console.error(`ffmpeg exited! Exit code: ${code}. Exit signal ${signal}.`)
})
ffmpeg.on(`error`, (err) => {
    console.error(`ffmpeg encountered an error!`)
    console.error(err)
})

ffmpeg.stdout.on(`data`, (chunk) => {
    lastTimeDataReceived = moment()
    mp3OutputStreams = mp3OutputStreams.filter(stream => {
        if (stream.writableEnded) {
            return false
        }
        if (stream.writable) {
            stream.write(chunk)
            return true
        }
        console.warn(`We have a stream which is neither ended nor is writeable! Removing it just in case ...`)
        return false
    })
})

shairportSyncPCMInputStream.pipe(ffmpeg.stdin)


const app = express();


app.get(`/`, (_, res) => {
    const html = '<!DOCTYPE html><html lang="en"><body><audio controls><source src="radio.mp3" type="audio/mpeg"></audio></body>'
    res.contentType(`text/html`)
    res.write(html)
    res.end()
})

app.get('/radio.mp3', (req, res) => {
    console.debug(`Somebody is trying to listen to the radio ...`)

    activeStreamingConnections += 1

    req.on(`close`, async () => {
        activeStreamingConnections -= 1
    })

    res.contentType(`audio/mpeg`)
    mp3OutputStreams.push(res)
})

const listener = app.listen(process.env.PORT, (arg1, arg2, arg3) => {
    console.debug(`The webserver is running and listening on port ${listener.address().port}`)
});


(async () => {
    while (true) {
        await new Promise((resolve => setTimeout(resolve, 5000)))
        console.info(`Last time data received: ${lastTimeDataReceived.fromNow()}`)
        console.info(`Currently active connections: ${activeStreamingConnections}`)
        if (shairportSyncPCMInputStreamError !== null) {
            console.error(`Following error occurred:`)
            console.error(JSON.parse(JSON.stringify(shairportSyncPCMInputStreamError)))
        }
        console.log()
    }
})()
