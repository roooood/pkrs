var colyseus = require('colyseus')
  , ServerIO = require('./server')
  , ServerChat = require('./chat')
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
  Connection.query('SELECT * FROM `poker_table` ')
    .then(results => {
      response.send(results)
    });
})
app.get('/info/:session', function (request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  var req = request.params
  let ret = {};
  Connection.query('SELECT * FROM `users` LEFT JOIN `wallets` ON `users`.`token` = `wallets`.`token` where `users`.`token`=? LIMIT 1', [req.session])
    .then(results => {
      if (results[0] != null) {
        ret = {
          result: 'ok',
          data: {
            id: results[0].userId,
            name: results[0].username,
            balance: results[0].balance
          }
        };
        if (results[0].admin == 1) {
          ret.data.admin = true;
        }
        else if (results[0].mute == 1) {
          ret.data.mute = true;
        }
        Connection.query('SELECT * FROM `poker_setting` LIMIT 1')
          .then(results => {
            ret.setting = results[0];
            ret.setting.timer = parseInt(ret.setting.timer) * 1000
            response.send(ret)
          });
      } else {
        ret.result = 'no';
        Connection.query('SELECT * FROM `poker_setting` LIMIT 1')
          .then(results => {
            ret.setting = results[0];
            ret.setting.timer = parseInt(ret.setting.timer) * 1000
            response.send(ret)
          });
      }
    }, e => {
      ret.result = 'no';
      Connection.query('SELECT * FROM `poker_setting` LIMIT 1')
        .then(results => {
          ret.setting = results[0];
          ret.setting.timer = parseInt(ret.setting.timer) * 1000
          response.send(ret)
        });
    });
});
gameServer.register('poker', ServerIO);
gameServer.register('poker-chat', ServerChat);
server.listen(port);

// var request = require('request');
// var url = require("url");

// http.createServer(function (req, res) {
//   let path = url.parse(req.url).path;
//   if (path.indexOf('http') === 0) {
//     request(path, function (error, response, body) {
//       return res.end(body);
//     });
//   }
//   else {
//     if (path.indexOf('/assets') === 0) {
//       path = '/ls/widgets' + path;
//     }
//     let xurl = 'https://cs.betradar.com';
//     xurl += path == '/' ? '/ls/widgets/?/betradar/en/page/widgets_demolmt#matchId=19050236' : path;
//     request(xurl, function (error, response, body) {
//       return res.end(body);
//     });
//   }
// }).listen(2657);