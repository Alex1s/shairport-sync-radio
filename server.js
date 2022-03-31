`use strict`

const express = require('express');
const process = require(`process`)
const child_process = require(`child_process`)

let mp3OutputStreams = []
let activeStreamingConnections = 0
const app = express();

function shairportSyncCommand() {
    return `shairport-sync -c ${process.env.CONFIG_PATH || './shairport-sync.conf'}`
}

function ffmpegCommand() {
    const inputArgs = `-f s16le -ar 44100 -ac 2`
    const outputArgs = `-f mp3 -codec:a libmp3lame -b:a 320k -compression_level 0`
    return `ffmpeg ${inputArgs} -i pipe:0 ${outputArgs} pipe:1`
}

function command() {
    return `${shairportSyncCommand()} | ${ffmpegCommand()}`
}

function setActiveStreamCount(count) {
    activeStreamingConnections = count
    console.info(`Currently active connections: ${activeStreamingConnections}`)
}

function shutdown() {
    return new Promise(resolve => {
        console.debug(`Closing express app ...`)
        listener.close(err => {
            if (err) {
                console.error(`During shutdown following error occurred:`)
                console.error(err)
            }
            console.debug(`Express app closed!`)
            process.exit(1)
        })
    })
}


const shairportSyncMP3 = child_process.spawn(command(), {shell: true, stdio: [`ignore`, `pipe`, process.env.DEBUG ? 'inherit' : `ignore`]})

shairportSyncMP3.on(`error`, async err => {
    console.error(`shairportSyncMP3 raised following error:`)
    console.error(err)

    await shutdown()
})

shairportSyncMP3.on(`exit`, async (code, signal) => {
    console.error(`shairportSyncMP3 exited! Exit code: ${code}. Exit signal ${signal}.`)

    await shutdown()
})

shairportSyncMP3.stdout.on(`data`, (chunk) => {
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


app.get(`/`, (_, res) => {
    const html = '<!DOCTYPE html><html lang="en"><body><audio controls><source src="radio.mp3" type="audio/mpeg"></audio></body>'
    res.contentType(`text/html`)
    res.write(html)
    res.end()
})

app.get('/radio.mp3', (req, res) => {
    setActiveStreamCount(activeStreamingConnections + 1)

    req.on(`close`, async () => {
        setActiveStreamCount(activeStreamingConnections - 1)
    })

    res.contentType(`audio/mpeg`)
    mp3OutputStreams.push(res)
})

const listener = app.listen(process.env.PORT, () => {
    console.debug(`The webserver is running and listening on port ${listener.address().port}`)
});