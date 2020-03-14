var colyseus = require('colyseus')
  , ServerIO = require('./server')
  , Connection = require('./connection')
  , http = require('http')
  , express = require('express')
  // , bodyParser = require("body-parser")
  , port = process.env.PORT || 2657
  , app = express();

var server = http.createServer(app)
  , gameServer = new colyseus.Server({ server: server })

// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

app.get('/tableList', function (request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  let ret = {};
  Connection.query('SELECT * FROM `poker_table` ORDER BY `order` ASC ')
    .then(results => {
      response.send(results)
    });
})
app.get('/avatar/:avatar/:session', function (request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  var req = request.params
  let ret = {};
  Connection.query('SELECT * FROM `users`  where `token`=? LIMIT 1', [req.session])
    .then(results => {
      if (results[0] != null) {
        Connection.query('SELECT * FROM `poker_users`  where `uid`=? LIMIT 1', [results[0].userId])
          .then(results2 => {
            if (results2[0] == null) {
              let sql = {
                uid: results[0].userId,
                avatar: req.avatar
              }
              Connection.query('INSERT INTO `poker_users` SET ?', sql);
              response.send({ result: 'ok' });
            }
            else {
              response.send({ result: '-' });
            }
          });
      }
      else {
        response.send({ result: 'no' });
      }
    });
});
app.get('/info/:session', function (request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  var req = request.params
  let ret = {};
  Connection.query('SELECT * FROM `users` LEFT JOIN `wallets` ON `users`.`token` = `wallets`.`token` LEFT JOIN `poker_users` ON `users`.`userId` = `poker_users`.`uid` where `users`.`token`=? LIMIT 1', [req.session])
    .then(results => {
      if (results[0] != null) {
        ret = {
          result: 'ok',
          data: {
            id: results[0].userId,
            name: results[0].username,
            avatar: results[0].avatar,
            balance: results[0].balance
          }
        };
        if (results[0].admin == 1) {
          ret.data.admin = true;
        }
        else if (results[0].mute == 1) {
          ret.data.mute = true;
        }
        response.send(ret);
      }
      else {
        response.send({ result: 'no' });
      }
    });
});
gameServer.register('poker', ServerIO);
server.listen(port);