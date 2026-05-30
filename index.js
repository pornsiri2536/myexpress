import express from 'express';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import{ GoogleGenAI } from '@google/genai';
import * as line from '@line/bot-sdk';
import * as fs from "node:fs";

// ตั้งค่าจาก LINE Developers Console
const config= {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

// create LINE SDK client
const client = line.LineBotClient.fromChannelAccessToken({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

// create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  //process.env.SUPABASE_KEY,
  process.env.UPABASE_SERVICE_ROLE_KEY
);
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
const app = express();

// 1. สร้าง Blob Client สำหรับดึงข้อมูลไฟล์โดยเฉพาะ (ของ v9+)
const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || ''
});

const downloadLineContent = async (messageId) => {
  const stream = await lineBlobClient.getMessageContent(messageId);
  const chunks = [];
 
  // รองรับทั้งแบบ Blob (มี arrayBuffer) และแบบ Stream
  if (stream.arrayBuffer) {
    const arrayBuffer = await stream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: stream.type || 'image/jpeg'
      },
      buffer: buffer
    };
  } else {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/jpeg'
      },
      buffer: buffer
    };
  }
};

async function downloadImage(url, destPath) {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    // Convert response to an ArrayBuffer, then to a Buffer for Node.js fs
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save the buffer to the local file system
    await fs.writeFile(destPath, buffer);
    console.log('Image saved successfully!');
  } catch (error) {
    console.error('Error downloading image:', error);
  }
}

async function handleImage(messageId, replyToken) {
  try {
    // ดาวน์โหลดรูปภาพจาก LINE และดึงมาทั้ง Base64 และ Buffer
    const imageContent = await downloadLineContent(messageId);
   
    const fileName = `${messageId}.jpg`;

    // 4. อัปโหลดเข้า Supabaseตามปกติ
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('images')
      .upload(`bot-uploads/${fileName}`, imageContent.buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) throw new Error(uploadError.message);

    // 5. ดึง Public URL กลับออกไป
    const { data: publicUrlData } = supabase
      .storage
      .from('images')
      .getPublicUrl(`bot-uploads/${fileName}`);

      let botReplyText = '';

      try{
        //ส่งข้อความของผู้ใช้ไปให้ Gemini คิดคำตอบ(ใช้โมเดลล่าสุด gemini-2.5-flash)
        const imageUrl = publicUrlData.publicUrl;

        const response = await fetch(imageUrl);
        const imageArrayBuffer = await response.arrayBuffer();
        const base64ImageData = Buffer.from(imageArrayBuffer).toString('base64');

        const contents = [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64ImageData,
            },
          },
          { text: "รูปสัตว์" },
        ];

        const geminiResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: contents,
        });
        
        botReplyText=geminiResponse.text||'ขออภัยครับ ระบบไม่สามารถสร้างคำตอบได้';
    } catch (error) {
        console.error('ส่งข้อความของผู้ใช้ไปให้ Gemini คิดคำตอบ(ใช้โมเดลล่าสุด gemini-2.5-flash:', error);
    }
     // ตอบกลับข้อความไปยังผู้ใช้ใน LINE
    return await client.replyMessage({
      replyToken: replyToken,
      messages: [
        {
          type: 'image',
          originalContentUrl: publicUrlData.publicUrl,
          previewImageUrl: publicUrlData.publicUrl
        },
        {
          type: 'text',
          text: botReplyText,
        },
      ],
    });

    //return publicUrlData.publicUrl;

  } catch (error) {
    console.error('Error ในการดึงรูปภาพด้วย SDK v9:', error);
    return null;
  }
}

// รับ webhook
// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});


// ฟังก์ชัน handleEvent(event) ใหม่ ตามตัวอย่างและคอมเมนต์ของเดิมทิ้งไป
// 4. ฟังก์ชันหลักในการจัดการ Event และบันทึกข้อมูล
async function handleEvent(event) {
  // รองรับเฉพาะ Event ประเภทข้อความ (Message Event) เท่านั้น
  if (event.type === "message" && event.message.type === "image") {
    return handleImage(event.message.id, event.replyToken || '');
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userId = event.source.userId || 'unknown';
  const replyToken = event.replyToken || '';
 
  // ดึงข้อมูลพื้นฐานจาก Message Object ของ LINE
  const messageId = event.message.id;
  const messageType = event.message.type; // text, image, sticker, video, etc.
 
  let content = null;
  let botReplyText = '';

  // ตรวจสอบเงื่อนไขตามประเภทข้อความ
  if (event.message.type === 'text') {
    content = event.message.text;
    botReplyText = event.message.text; // ข้อความที่จะตอบกลับ (Echo)
  } else {
    // หากเป็นประเภทอื่น เช่น image, sticker, video
    content = `[Received ${messageType} message]`;
    botReplyText = `ได้รับข้อความประเภท ${messageType} แล้วครับ`;
  }

  /*try{
    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: content,
    });
    botReplyText = geminiResponse.text || 'ขออภัยครับ ระบบไม่สามารถสร้างคำตอบได้';
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการประมวลผลระบบ:', error);
  }*/

  try {
    // บันทึกข้อมูลลงตาราง messages ใน Supabase (บันทึกคู่ทั้งคำถามและคำตอบที่เตรียมไว้)
    const { error } = await supabase
      .from('messages')
      .insert([
        {
          user_id: userId,
          message_id: messageId,
          type: messageType,
          content: content,
          reply_token: replyToken,
          reply_content: botReplyText
        }
      ]);

    if (error) {
      console.error('Supabase Insert Error:', error.message);
    }

    // ตอบกลับข้อความไปยังผู้ใช้ใน LINE
    return await client.replyMessage({
      replyToken: replyToken,
      messages: [
        {
          type: 'text',
          text: botReplyText,
        },
      ],
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการประมวลผลระบบ:', error);
  }
}


// Health check endpoint
app.get('/', (req, res) => {
 //  res.send('hello world,pornsiri');
  res.json({ message: 'hello world,pornsiri' });
});
// เพิ่มส่วนนี้เข้าไปเพื่อให้แสดงผลลัพธ์เหมือนลิงก์ตัวอย่างเป๊ะๆ
app.get('/functions/v1/line', (req, res) => {
  res.json({ message: "GET: Hello Ann Pornsiri!" });
});

// Start server
const port = process.env.PORT || 3015;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});