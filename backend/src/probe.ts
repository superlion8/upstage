// Minimal probe to test runtime
console.log('----------------------------------------');
console.log('✅ PROBE: Container is running!');
console.log('✅ PROBE: TSX is working!');
console.log('✅ PROBE: Environment:', process.env.NODE_ENV);
console.log('----------------------------------------');

// Keep alive for 10 seconds to allow logs to flush
setTimeout(() => {
    console.log('✅ PROBE: Exiting normally.');
    process.exit(0);
}, 10000);
