"use strict";

const http = require("node:http");

const port = 8000;

const requestHandler = (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
};

const server = http.createServer(requestHandler);

server.listen(port, () => {
  console.log(JSON.stringify({ message: "TripTrace API listening", port }));
});
