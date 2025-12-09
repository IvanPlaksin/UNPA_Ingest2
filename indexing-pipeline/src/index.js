console.log('ETL Worker started...');
console.log('Connecting to Redis at', process.env.REDIS_HOST);
console.log('Connecting to Neo4j at', process.env.NEO4J_URI);
console.log('Connecting to Chroma at', process.env.CHROMA_HOST);

// Keep the process alive
setInterval(() => {
  console.log('Heartbeat...');
}, 10000);
