require('dotenv').config();
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env.');
if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long.');
const app=require('./app');
const pool=require('./db/pool');
const {startRazorpayBookingCleanup}=require('./utils/razorpayBookingCleanup');
const port=Number(process.env.PORT||5000);
const server=app.listen(port,()=>console.log(`NanoSpace API listening on port ${port}`));
startRazorpayBookingCleanup();
async function shutdown(signal){
 console.log(`${signal} received; shutting down...`);
 server.close(async()=>{await pool.end();process.exit(0);});
 setTimeout(()=>process.exit(1),10000).unref();
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
