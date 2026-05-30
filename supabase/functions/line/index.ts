import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenAI } from 'npm:@google/genai';
import { Client } from "npm:@line/bot-sdk";

// 1. ตั้งค่า LINE และ Supabase Client
const config = {
  channelAccessToken: Deno.env.get('CHANNEL_ACCESS_TOKEN') || '',
  channelSecret: Deno.env.get('CHANNEL_SECRET') || '',
};

const lineClient = new Client(config);

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// เรียกใช้ Google Gen AI
const ai = new GoogleGenAI();

// 2. ฟังก์ชันหลักสำหรับรองรับ Request
Deno.serve(async (req) => {
  // รองรับการเปิดลิงก์ผ่าน Browser ตรงๆ (GET) เพื่อเช็กสถานะ
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: "online", message: "LINE Bot Webhook is ready!" }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  }

  // รองรับการส่งข้อมูลมาจาก LINE Webhook (POST)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const events = body.events || [];

      for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
          const userMessage = event.message.text;
          const replyToken = event.replyToken;
          const userId = event.source.userId;

          // ส่งข้อความไปถาม Gemini AI
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userMessage,
          });
          const aiReply = response.text || "ขออภัยด้วยครับ ผมไม่สามารถประมวลผลข้อความนี้ได้";

          // บันทึกข้อความลงตาราง messages
          await supabase.from('messages').insert([
            { 
              user_id: userId, 
              message: userMessage, 
              reply_message: aiReply 
            }
          ]);

          // ส่งคำตอบกลับไปหาผู้ใช้ใน LINE
          await lineClient.replyMessage(replyToken, {
            type: 'text',
            text: aiReply,
          });
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing event:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});