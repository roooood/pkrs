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
        response.send(ret);
      }
      else {
        response.send({ result: 'no' });
      }
    });
});
gameServer.register('poker', ServerIO);
server.listen(port);