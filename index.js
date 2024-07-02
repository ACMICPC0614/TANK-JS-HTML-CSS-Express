const express = require("express");

const server = express();

const cors = require("cors");
const { DefaultSerializer } = require("v8");
const { kill } = require("process");
const server_http = require("http").Server(server);
const PORT = 8800;
const socketIO = require("socket.io")(server_http, {
  cors: "*",
});

server.use(cors());
server.get("/", (req, res) => {
  res.send("server is running");
});
server_http.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

const client = express();
// client.use("/public/index.html", express.static("public"));
client.use(express.static("public"));
const client_http = require("http").Server(client);
const F_PORT = 3333;
client.get("/", (req, res) => {
  res.send("client is running");
});

let users = [];
let stack = [];

/*********TANK Setting*************/

const BOARD_SIZE = 111;
const TIMEperS = 50;
const FRAME = Math.floor(1000 / TIMEperS); // every 50ms render

const UP = "UP";
const DOWN = "DOWN";
const LEFT = "LEFT";
const RIGHT = "RIGHT";
const ALIVE = "ALIVE";
const DEATH = "DEATH";

const para = [0, 10, 23, 30];
const TANK_SPEED = 5;
const TANK_LEVEL = 0;
let TANK_HEALTH = 100 + Math.min(para[TANK_LEVEL] * 2, 50);
let T1_scr = 0;
let T2_scr = 0;

/*********Shot Setting*************/

const SHOT_CYCLE = 20;
const BULLET_DAMAGE = 40;
const BULLET_LIFE = 70;
const BULLET_SPEED = 5;

/*********default Setting******* ******/

const getStartPoint = (BOARD_SIZE) => {
  let tmpx = (Math.floor(Date.now() * Math.random()) % (BOARD_SIZE - 30)) + 10;
  let tmpy = (Math.floor(Date.now() * Math.random()) % (BOARD_SIZE - 30)) + 10;
  return { x: tmpx, y: tmpy };
};

const getStartDirection = () => {
  let tmp = Math.floor(Date.now() * Math.random()) % 4;
  if (tmp === 0) return UP;
  if (tmp === 1) return DOWN;
  if (tmp === 2) return LEFT;
  if (tmp === 3) return RIGHT;
};

const shut = (item) => {
  if (item.shottime === 0) {
    makeBullet(item);
    item.shottime = item.shotCycle;
  } else item.shottime -= 1;
};

const makeBullet = (item) => {
  const bullet = {
    x: item.x,
    y: item.y,
    direction: item.direction,
    team: item.team,
    life: BULLET_LIFE,
    socketID: item.socketID,
    // damage: BULLET_DAMAGE,
  };
  stack.push(bullet);
};

const updateStack = () => {
  for (item of stack) {
    bulletMove(item);
  }
  let tmp = [];
  tmp = stack.filter(
    (item) =>
      item.life > 0 &&
      item.x <= BOARD_SIZE &&
      item.y <= BOARD_SIZE &&
      item.x >= 0 &&
      item.y >= 0
  );
  stack = [];
  stack = tmp;
};
const bulletMove = (item) => {
  if (item.direction === UP) item.y -= 2;
  if (item.direction === DOWN) item.y += 2;
  if (item.direction === LEFT) item.x -= 2;
  if (item.direction === RIGHT) item.x += 2;
  item.life -= 1;
};

const tankMove = (item) => {
  if (item.direction === UP) item.y -= 1;
  if (item.direction === DOWN) item.y += 1;
  if (item.direction === LEFT) item.x -= 1;
  if (item.direction === RIGHT) item.x += 1;

  return item;
};

const setInputDir = (item) => {
  if (item.x < 3 && item.direction === LEFT) return item;
  if (item.x > BOARD_SIZE - 3 && item.direction === RIGHT) return item;
  if (item.y < 3 && item.direction === UP) return item;
  if (item.y > BOARD_SIZE - 3 && item.direction === DOWN) return item;

  return tankMove(item);
};

const isCrach = (bullet, tank) => {
  if (bullet.socketID === tank.socketID) return false;
  if (Math.abs(bullet.x - tank.x) <= 1 && Math.abs(bullet.y - tank.y) <= 1)
    return true;
  else return false;
};
const isCrashWithBullet = (but1, but2) => {
  if (but1.socketID === but2.socketID) return false;
  if (but1.x === but2.x && but1.y === but2.y) return true;
  return false;
};

const increateKill = (bullet) => {
  for (item of users) if (item.socketID === bullet.socketID) item.kill += 1;
};

const checkCrash = () => {
  for (bullet of stack) {
    for (item of users) {
      const tank = { x: item.x, y: item.y };
      if (isCrach(bullet, item)) {
        bullet.life = 0;
        // increateKill(bullet);
        if (bullet.team !== item.team) {
          users = users.map((item) =>
            item.socketID === bullet.socketID
              ? { ...item, kill: item.kill + 1 }
              : item
          );
          item.alive = DEATH;
        }
      }
    }
    for (bullet2 of stack) {
      if (isCrashWithBullet(bullet, bullet2)) {
        bullet.life = 0;
        bullet.life2 = 0;
      }
    }
  }
};

const mainLoop = () => {
  updateUser();
  updateStack();
  checkCrash();
};

const updateUser = () => {
  for (item of users) {
    shut(item);
  }
};

const isExist = (id) => {
  let tmp = true;
  for (item of users) {
    if (item.socketID === id) tmp = false;
  }
  return tmp;
};

let boradCast = setInterval(() => {
  mainLoop();
  users = users.filter((item) => item.alive === ALIVE);
  const data = {
    users: users,
    stack: stack,
  };
  socketIO.emit("stateOfUsers", data);
}, FRAME);

/*****************SOCKET**********************/
socketIO.on("connect", (socket) => {
  console.log("connected with client");

  socket.on("newUser", (data) => {
    let newUser = {
      userName: data.userName,
      team: data.team || 1,

      socketID: data.socketID,
      level: TANK_LEVEL,
      kill: 0,
      death: 0,
      health: TANK_HEALTH,
      alive: ALIVE,

      direction: getStartDirection(),
      x: getStartPoint(BOARD_SIZE).x,
      y: getStartPoint(BOARD_SIZE).y,

      shotCycle: SHOT_CYCLE,
      shottime: 0,
      BULLET_LIFE: BULLET_LIFE,
    };
    if (isExist(newUser.socketID)) {
      users.push(newUser);
      console.log(newUser.userName, " is connected in Team ", newUser.team);
      socketIO.emit("newUserResponse", newUser);
    }
  });

  socket.on("test", () => {
    console.log("working now");
  });

  socket.on("changeDirection", (data) => {
    users = users.map((item) =>
      item.socketID === data.socketID
        ? { ...item, direction: data.direction }
        : item
    );
  });

  socket.on("forward", (data) => {
    users = users.map((item) =>
      item.socketID === data.socketID ? setInputDir(item) : item
    );
  });
});

client_http.listen(F_PORT, () => {
  console.log(`Client listening on ${F_PORT}`);
});
