Deno.serve(async (req) => {
  console.log("LINE webhook called")

  // return new Response("OK", {
  //   status: 200,
  // })
  const data = { message: "Hello from Supabase!" };

return new Response(
  JSON.stringify(data),
  { 
    headers: { "Content-Type": "application/json" },
    status: 200 
  }
);
})