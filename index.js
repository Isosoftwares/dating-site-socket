const express = require("express");
const app = express();
const unirest = require("unirest");
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: ["https://admin.writersgigshub.com", "http://localhost:5173"],
  },
});

let activeUsers = new Map(); // Using a Map to store multiple socketIds per userId

function getActiveUsersArray() {
  return Array.from(activeUsers.keys()).map((userId) => ({ userId }));
}

io.on("connection", (socket) => {
  socket.on("new-user-add", (newUserId) => {
    if (!activeUsers.has(newUserId)) {
      activeUsers.set(newUserId, new Set());
    }
    activeUsers.get(newUserId).add(socket.id);
    console.log("New User Connected", getActiveUsersArray());
    io.emit("get-users", getActiveUsersArray());
  });

  socket.on("disconnect", async () => {
    for (const [userId, socketIds] of activeUsers.entries()) {
      socketIds.delete(socket.id); // Remove the disconnected socket ID
      if (socketIds.size === 0) {
        activeUsers.delete(userId); // Remove the user from active users if no sockets remain

        // Update the user's lastSeen timestamp in the database
        try {
          const url = `http://localhost:3502/user/update-last-seen`;

         const response = await unirest("POST", url)
            .headers({
              "Content-Type": "application/json",
            })
            .send({
              userId
            });
          console.log(`User ${userId} last seen updated.`, response?.body);
        } catch (error) {
          console.error(
            `Failed to update last seen for user ${userId}:`,
            error
          );
        }
      }
    }

    console.log("User Disconnected", getActiveUsersArray());
    io.emit("get-users", getActiveUsersArray()); // Broadcast updated active users list
  });

  socket.on("send-message", (data) => {
    const { receiverId } = data;
    const socketIds = activeUsers.get(receiverId);
    if (socketIds) {
      for (const socketId of socketIds) {
        io.to(socketId).emit("receive-message", data);
      }
    }
  });
});

// Enable CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Start the server
const port = 8800;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
