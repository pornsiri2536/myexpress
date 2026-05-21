import { createClient } from '@supabase/supabase-js'
require('dotenv').config();
const https = require("https");
const express = require('express');
const line = require('@line/bot-sdk');


// Supabase client setup
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

// ตั้งค่าจาก LINE Developers Console
const config = {
  channelAccessToken: 'op4n6ys/ZQHx8E6TC1zzjh6Xnp/l4TjqcL6BjtnOChY+J1+Wgw2kNPirkvVUA4z0JSXkbRRcEZYQ3priCoC5czRJbnAY8eqOjydZjPFFV7aL74AfWetZBGEua+JcDlDlMFrat2XdgCrX2W/imtqrQAdB04t89/1O/w1cDnyilFU=',
  channelSecret: 'd3b14aff69448de2306c0126f705a9df'
};

app.post("/callback", function (req, res) {
  res.send("HTTP POST request sent to the webhook URL!");
  // If the user sends a message to your bot, send a reply message
  if (req.body.events[0].type === "message") {
    // You must stringify reply token and message data to send to the API server
    const dataString = JSON.stringify({
      // Define reply token
      replyToken: req.body.events[0].replyToken,
      // Define reply messages
      messages: [
        {
          type: 'text',
          text: `คุณพิมพ์ว่า: ${req.body.events[0].message.text}`
        },
      ],
    });

    // Request header. See Messaging API reference for specification
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer op4n6ys/ZQHx8E6TC1zzjh6Xnp/l4TjqcL6BjtnOChY+J1+Wgw2kNPirkvVUA4z0JSXkbRRcEZYQ3priCoC5czRJbnAY8eqOjydZjPFFV7aL74AfWetZBGEua+JcDlDlMFrat2XdgCrX2W/imtqrQAdB04t89/1O/w1cDnyilFU=",
    };

    // Options to pass into the request, as defined in the http.request method in the Node.js documentation
    const webhookOptions = {
      hostname: "api.line.me",
      path: "/v2/bot/message/reply",
      method: "POST",
      headers: headers,
      body: dataString,
    };

    // When an HTTP POST request of message type is sent to the /webhook endpoint,
    // we send an HTTP POST request to https://api.line.me/v2/bot/message/reply
    // that is defined in the webhookOptions variable.

    // Define our request
    const request = https.request(webhookOptions, (res) => {
      res.on("data", (d) => {
        process.stdout.write(d);
      });
    });

    // Handle error
    // request.on() is a function that is called back if an error occurs
    // while sending a request to the API server.
    request.on("error", (err) => {
      console.error(err);
    });

    // Finally send the request and the data we defined
    request.write(dataString);
    request.end();
  }
});

app.use('/callback2', line.middleware(config));

// รับ webhook
app.post('/callback2', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result));
});

// Move client initialization before handleEvent
const client = new line.messagingApi.MessagingApiClient(config);

// ตอบกลับข้อความ
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `คุณพิมพ์ว่า: ${event.message.text}`
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send('hello world,pornsiri');
});

// Start server
const port = process.env.PORT || 3015;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});