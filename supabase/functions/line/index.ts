Deno.serve(async (_req) => {
  console.log("LINE webhook called")

  return new Response(
    JSON.stringify({ message: "GET: Hello Ann Pornsiri!" }),
    { 
      headers: { "Content-Type": "application/json" },
      status: 200 
    }
  );
})