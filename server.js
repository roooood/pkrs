var colyseus = require('colyseus'),
    request = require("Request"),
    autoBind = require('react-autobind'),
    Hand = require('pokersolver').Hand,
    Connection = require('./connection');

class State {
    constructor() {
        this.started = false;
        this.turn = null;
        this.players = {};
        this.online = 0;
        this.cardId = 0;
        this.bet = 0;
        this.bank = 0;
        this.deck = [];
        this.message = [];
    }
}
class metaData {
    constructor(options) {
        this.title = options.title;
        this.id = options.id;
        this.min = Number(options.min);
        this.max = Number(options.max);
        this.player = options.player;
        this.type = options.type;
        this.ready = 0;
        this.users = {};
    }
}
class Server extends colyseus.Room {
    constructor(options) {
        super(options);
        this.first = true;
        this.level = 1;
        this.deck = [];
        this.userDeck = {};
        autoBind(this);
    }
    async onInit(options) {
        this.fillDeck(this.deck);
        this.setState(new State);
        await Connection.query('SELECT * FROM `poker_setting` LIMIT 1')
            .then(results => {
                this.setting = results[0];
                this.setting.timer = parseInt(this.setting.timer) * 1000;
            });
    }
    requestJoin(options, isNewRoom) {
        return (options.create) ?
            (options.create && isNewRoom) :
            this.clients.length > 0;
    }
    async onAuth(options) {
        let ret = {
            guest: true
        };
        if (options.key != 0)
            await Connection.query('SELECT * FROM `users` LEFT JOIN `poker_users` ON `poker_users`.`uid` = `users`.`userId` LEFT JOIN `wallets` ON `users`.`token` = `wallets`.`token` where `users`.`token`=? LIMIT 1', [options.key])
                .then(results => {
                    if (results[0] != null) {
                        ret = {
                            id: results[0].userId,
                            name: results[0].username,
                            avatar: results[0].avatar,
                            balance: results[0].balance || 0
                        };
                        if (results[0].admin == 1) {
                            ret.admin = true;
                        }
                        else if (results[0].mute == 1) {
                            ret.mute = true;
                        }
                    }
                }, e => {
                    ret = {
                        guest: true
                    };
                });
        return ret;
    }
    async onJoin(client, options, auth) {
        if (this.first) {
            await Connection.query('SELECT * FROM `poker_table` WHERE `id` =?  LIMIT 1', [options.id])
                .then(results => {
                    this.meta = new metaData({
                        id: options.id || null,
                        title: results[0].name || 'no name',
                        min: results[0].min || this.setting.minbet,
                        max: results[0].max || this.setting.maxbet,
                        player: results[0].player || 0,
                        type: results[0].type || 'holdem',
                    });
                    this.setMetadata(this.meta);
                    this.state.bet = this.meta.min;
                });
        }
        if ('guest' in auth) {
            client.guest = true;
            client.mute = true;

        } else {
            client.guest = false;
            for (let i in auth)
                client[i] = auth[i];
        }
        this.send(client, {
            welcome: { ...this.meta, setting: this.setting },
        });

        let cl;
        for (cl of this.clients) {
            if (!cl.guest && (cl.id == client.id && client.sessionId != cl.sessionId)) {
                client.close();
            }
        }
        if (this.first) {
            this.first = false;
            this.timer = this.clock.setTimeout(() => {
                // this.sit(client, 4)
                this.checkMessage();
            }, 3000);

        }
        for (let sit in this.state.players) {
            if (this.state.players[sit].id == client.id) {
                client.sit = sit;
                this.clock.setTimeout(() => {
                    this.send(client, { mySit: client.sit });
                }, 1000);
                delete this.state.players[sit].leave;

            }
        }
        this.state.online = this.state.online + 1;
    }
    onMessage(client, message) {
        let type = Object.keys(message)[0];
        if (client.guest == true) {
            return;
        }

        let value = message[type];
        switch (type) {
            case 'sit':
                this.sit(client, value)
                break;
            case 'stand':
                this.stand(client)
                break;
            case 'action':
                if (this.state.turn == client.sit)
                    this.actionResult(client, value)
                break;
            case 'imReady':
                this.checkStart(client, true)
                break;
            case 'chat':
                if (!('mute' in client))
                    this.chat(client, value)
                break;
            case 'mute':
                if ('admin' in client)
                    this.muteUser(value);
                break;
            case 'delete':
                if ('admin' in client)
                    this.deleteChat(value);
                break;
        }
    }
    onLeave(client, consented) {
        this.state.online = this.state.online - 1;
        this.checkState(client)
    }
    onDispose() {

    }
    sit(client, sit) {
        if (client.guest) {
            this.send(client, { guest: true });
            return;
        }
        if (this.state.players[sit] == null) {
            if (client.sit > 0 && this.state.started) {
                return;
            }
            this.stand(client);
            client.sit = sit;
            this.state.players[sit] = { id: client.id, name: client.name, avatar: client.avatar, balance: client.balance };
            this.setClientReady();
            if (!this.state.started)
                this.canStart();
            this.send(client, { mySit: sit });
            return true;
        }
        return false;
    }
    checkState(client) {
        let sit = client.sit || 0;
        if (sit > 0) {
            if (!this.state.started) {
                this.standBySit(sit);
                return;
            }
            if ('ready' in this.state.players[sit]) {
                if (this.state.players[sit].ready == false) {
                    this.standBySit(sit)
                }
                else {
                    this.state.players[client.sit].leave = true;
                }
            }

        }
    }
    stand(client) {
        let sit = client.sit || 0;
        if (sit > 0) {
            this.checkState(client);
        }
    }
    standBySit(sit) {
        delete this.state.players[sit];
        let user = this.userBySit(sit);
        if (user > -1)
            delete this.clients[user].sit;
        this.setClientReady();
    }
    canStart() {
        this.clearTimer();
        this.timer = this.clock.setTimeout(() => {
            if (this.ready() > 1) {
                this.start();
            }
        }, 1500);
    }
    start() {
        this.state.started = true;
        this.newRound();
    }
    newRound() {
        this.reset();
        this.broadcast({ game: 'start' });
        this.regnant = this.randomRegnant();
        this.newLevel();
        this.dispatch();
        this.setTimer(this.takeAction, 3000);
    }
    takeAction() {
        if (this.ready() < 2) {
            this.state.started = false;
            return;
        }
        this.nextAction();
    }
    nextAction() {
        console.log('turn ', this.state.turn)
        this.setTimer(this.noAction, this.setting.timer);
        this.broadcast({ takeAction: this.state.turn })
    }
    noAction() {
        this.actionIs('fold')
    }
    actionResult(client, [type, value]) {
        console.log(value)
        this.actionIs(type, value)
    }
    actionIs(type, value) {
        this.clearTimer();
        let sit = this.state.turn;
        let id = this.state.players[sit].id;
        let user = this.userById(id);
        let balance = user > -1 ? this.clients[user].balance : 0;
        this.state.players[sit].state = type;
        if (type == 'fold') {
            this.checkResult();
        }
        else if (type == 'call') {
            let userBet = this.state.players[sit].bet || 0;
            let amount = this.state.bet - userBet;
            if (balance < amount) {
                type = 'fold';
                this.checkResult();
            }
            else {
                if (amount > 0) {
                    this.state.players[sit].bet = this.state.bet;
                    this.updateUserBalance(id, balance, -amount);
                    this.state.bank = this.add(this.state.bank, amount);
                }
                this.nextTurn();
            }
        }
        else if (type == 'raise') {
            let userBet = this.state.players[sit].bet || 0;
            value = Number(value);
            let amount = value - userBet;
            if (value > this.state.bet && balance >= value && value <= this.meta.max) {
                this.state.bet = value;
                this.updateUserBalance(id, balance, - amount);
                this.state.players[sit].bet = value;
                this.state.bank = this.add(this.state.bank, amount);
                this.nextTurn();
            }
            else {
                type = 'fold';
                this.checkResult();
            }

        }
        this.broadcast({ actionIs: [this.state.turn, type] })
    }
    nextTurn() {
        let turn = this.state.turn;
        let newTurn = null, end = 9;
        for (let i = 1; i < end; i++) {
            let next = (turn + i) % end;
            next = next === 0 ? end : next;
            if (next in this.state.players) {
                let userBet = this.state.players[next].bet || 0;
                if ((userBet < this.state.bet && this.state.players[next].state != 'fold')) {
                    console.log('next', next, 'bet', userBet, 'state', this.state.players[next].state)
                    newTurn = next;
                }
                else if (this.state.players[next].state == 'new') {
                    newTurn = next;
                    console.log('new', next, 'bet', userBet, 'state', this.state.players[next].state)
                }
            }
        }
        if (newTurn) {
            this.state.turn = newTurn;
            this.nextAction();
        }
        else {
            this.checkLevel()
        }
    }
    checkLevel() {
        if (this.level == 1) {
            this.addtoDeck();
            this.newLevel();
            this.nextAction();
        }
        else if (this.level == 2) {
            this.addtoDeck();
            this.newLevel();
            this.nextAction();
        }
        else if (this.level == 3) {
            this.addtoDeck();
            this.newLevel();
            this.nextAction();
        }
        else {
            this.preResult();
        }
    }
    newLevel() {
        this.broadcast({ newLevel: this.level })
        this.state.turn = this.regnant;
        this.level++;
        for (let i in this.state.players) {
            if (this.state.players[i].state != 'fold') {
                this.state.players[i].state = 'new';
            }
        }
        console.log('level', this.level);
    }
    checkResult() {
        let count = 1, beting = 1;
        let player = this.ready();
        for (let i in this.state.players) {
            var bet = this.state.players[i].bet || 0;
            if (this.state.players[i].state == 'fold') {
                count++;
                if (bet == 0) {
                    beting++;
                }
            }
        }
        if (player == count) {
            if (beting == player)
                this.over();
            else {
                this.preResult();
            }
        }


    }
    returnBalance() {
        for (let sit in this.state.players) {
            if (this.state.players[sit].bet > 0) {
                let id = this.state.players[sit].id;
                let user = this.userById(id);
                let balance = user > -1 ? this.clients[user].balance : 0;
                this.updateUserBalance(id, balance, this.state.players[sit].bet);
                if (user > -1)
                    this.clients[user].balance += this.state.players[sit].bet;
            }
        }
    }
    preResult() {
        if (this.ready() > 1) {
            let date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
            let point = {
                bank: this.state.bank, commission: this.setting.commission, cardId: this.state.cardId, time: date
            }
            Connection.query('INSERT INTO `poker_points` SET ?', point)
                .then(results => {
                    Connection.query('SELECT LAST_INSERT_ID() AS `last_id` ')
                        .then(result => {
                            let id = result[0]['last_id'];
                            this.result(id);
                        });
                });

        } else {
            this.reset();
        }
    }
    result(xid) {
        let sit, wins = [], loses = [], id, user, balance, state, winner;
        let hands = [], hand = {};
        for (sit in this.state.players) {
            if (this.state.players[sit].state != 'fold') {
                hand[sit] = Hand.solve([...this.state.deck, this.userDeck[sit]]);
                hands.push(hand[sit]);
            }
        }

        winner = Hand.winners(hands);

        let commission = (Number(this.setting.commission) * this.state.bank) / 100;
        let amount = this.add(this.state.bank, -commission);
        amount /= winner.length;
        for (let win of winner) {
            for (sit in this.state.players) {
                if (sit in hand && hand[sit].name == win.name) {
                    console.log(hand[sit], sit)
                    hand[sit].win = true;
                    user = this.userBySit(sit);
                    id = this.state.players[sit].id;
                    balance = user > -1 ? this.clients[user].balance : 0;
                    this.updateUserBalance(id, balance, amount);
                    if (user > -1) {
                        this.clients[user].balance += amount;
                    }
                    wins.push(sit)
                }
                else {
                    loses.push(sit)
                }
            }
        }
        for (sit in this.state.players) {
            user = this.userBySit(sit);
            if (sit in hand && 'win' in hand[sit]) {
                state = true;
                if (user > -1)
                    this.send(this.clients[user], { win: true });
            }
            else {
                state = false;
                if (user > -1)
                    this.send(this.clients[user], { lose: true });
            }

            let result = {
                pid: xid,
                uid: this.state.players[sit].id,
                cash: state ? amount : this.state.players[sit].bet,
                type: state ? 'win' : 'lose'
            }
            Connection.query('INSERT INTO `poker_result` SET ?', result);
        }

        this.broadcast({ result: { wins, loses } });


        this.setTimer(this.over, 2500);
    }
    sendToPlayer(option) {
        for (let client in this.clients) {
            if ('sit' in this.clients[client]) {
                this.send(this.clients[client], option);
            }
        }
    }
    reset() {
        this.state.de = {};
        this.userDeck = {};
        this.level = 0;
        this.state.turn = null;
        this.state.bank = 0;
        this.state.deck = [];
        this.broadcast({ reset: true });
        this.checkLeave();
        let i;
        for (i in this.state.players) {
            delete this.state.players[i].state;
            delete this.state.players[i].bet;
        }
    }
    over() {
        this.returnBalance();
        this.state.started = false;
        this.clearTimer();
        this.reset();
        this.setTimer(this.canStart, 5000);
    }
    checkLeave() {
        let check = false;
        for (let i in this.state.players) {
            if ('leave' in this.state.players[i]) {
                this.standBySit(i);
                check = true;
            }
        }
        return check;
    }
    setClientReady() {
        this.meta.ready = this.ready();
        this.meta.users = this.state.players;
        this.setMetadata(this.meta);
    }
    ready() {
        return Object.keys(this.state.players).length;
    }

    randomRegnant() {
        let rand = Object.keys(this.state.players);
        let get = this.random(0, rand.length);
        let turn = rand[get];
        if (turn == this.state.turn) {
            return this.randomRegnant();
        }
        else
            return turn;
    }
    random(min, max) {
        return Math.floor(Math.random() * max) + min;
    }
    shuffle() {
        var a, b, c;
        for (a = 0; a < 10; a++) {
            for (b = this.deck.length - 1; b > 0; b--) {
                c = Math.floor(Math.random() * (b + 1));
                [this.deck[b], this.deck[c]] = [this.deck[c], this.deck[b]];
            }
        }
    }
    dispatch() {
        console.log('dispatch', this.meta)
        this.shuffle();
        this.chunk();

        let cards = {
            cards: this.deck.slice(0, 5).join(',')
        }
        Connection.query('INSERT INTO `poker_cards` SET ?', cards)
            .then(results => {
                Connection.query('SELECT LAST_INSERT_ID() AS `last_id` ')
                    .then(result => {
                        this.state.cardId = result[0]['last_id'];
                        let i, sit;
                        for (i = 1; i <= 9; i++) {
                            sit = this.userBySit(i);
                            if (sit > -1) {
                                this.send(this.clients[sit], { myCards: this.userDeck[i] });
                                let hands = {
                                    cardId: this.state.cardId, user: this.clients[sit].id, cards: this.userDeck[i].join(',')
                                }
                                Connection.query('INSERT INTO `poker_hands` SET ?', hands)
                            }
                        }
                    });
            });

        let i, sit;
        for (i = 1; i <= 9; i++) {
            sit = this.userBySit(i);
            if (sit > -1) {
                this.send(this.clients[sit], { myCards: this.userDeck[i] });
            }
        }
    }
    chunk() {
        console.log(this.meta)
        let size = this.meta.type == 'holdem' ? 2 : 4;
        let i, start, end;
        for (i = 1; i <= 9; i++) {
            start = (i * size) + 10;
            end = start + size;
            this.userDeck[i] = this.deck.slice(start, end);
        }
    }
    addtoDeck() {
        let len = this.state.deck.length;
        let end = len == 0 ? 3 : (len == 3 ? 4 : 5);
        this.state.deck = this.deck.slice(0, end);

    }
    chat(client, msg) {
        let message = {
            uid: client.id, tid: this.meta.id, text: msg
        }
        Connection.query('INSERT INTO `poker_message` SET ?', message)
            .then(results => {
                Connection.query('SELECT LAST_INSERT_ID() AS `last_id` ')
                    .then(result => {
                        let id = result[0]['last_id'];
                        this.state.message.unshift({
                            id: id,
                            uid: client.id,
                            sender: client.name,
                            message: msg
                        })
                    });
            });
    }
    objectsEqual(o1, o2) {
        return Object.keys(o1).every(key => o1[key] == o2[key]);
    }
    arraysEqual(a1, a2) {
        return a1.length === a2.length && a1.every((o, idx) => this.objectsEqual(o, a2[idx]));
    }
    checkMessage() {
        let len = this.state.message.length;
        len = len < 20 ? 20 : len;
        Connection.query('SELECT `poker_message`.*,`users`.`username` FROM `poker_message`  LEFT JOIN `users`  ON `poker_message`.`uid`=`users`.`userId` WHERE `poker_message`.`tid` = ? ORDER BY `poker_message`. `id` DESC LIMIT ?', [this.meta.id, len])
            .then(results => {
                let res, data = [];
                for (res of results) {
                    data.push({
                        id: res.id,
                        uid: res.uid,
                        sender: res.username,
                        message: res.text
                    })
                }
                if (!this.arraysEqual(data, this.state.message)) {
                    this.state.message = data;
                }
            });
    }
    deleteChat(id) {
        Connection.query('DELETE FROM `poker_message` WHERE `id` =  ?', [id]);
        this.checkMessage();
    }
    muteUser(user) {
        Connection.query('SELECT * FROM `poker_users` WHERE `uid` = ?', [user])
            .then(results => {
                if (results[0] == null) {
                    Connection.query('DELETE FROM `poker_message` WHERE `uid` = ?', [user]);
                    for (let i in this.clients) {
                        if (this.clients[i].id == user) {
                            this.clients[i].mute = true;
                        }
                    }
                    let message = {
                        uid: user, mute: 1
                    }
                    Connection.query('INSERT INTO `poker_users` SET ?', message);
                    this.checkMessage();
                }
            });

    }
    setTimer(callBack, timing) {
        this.timer = this.clock.setTimeout(() => callBack(), timing);
    }
    clearTimer() {
        if (this.timer != undefined) {
            this.timer.clear();
        }
    }
    userById(id) {
        let i;
        for (i in this.clients) {
            if (this.clients[i].id == id) {
                return i;
            }
        }
        return -1;
    }
    userBySit(sit) {
        let i;
        for (i in this.clients) {
            if (this.clients[i].sit == sit) {
                return i;
            }
        }
        return -1;
    }
    close() {
        let i;
        for (i in this.clients) {
            this.clients[i].close();
        }
    }
    updateUserBalance(id, balance, amount) {
        let user = this.userById(id);
        if (user > -1)
            this.send(this.clients[user], { balance: [balance, amount] })
        return;
        var user_token = "";
        Connection.query('SELECT * FROM `users` where `users`.`userId`=? LIMIT 1', [id])
            .then(results => {
                {
                    user_token = results[0].token;
                    var pid = 5;
                    var description;
                    var url = 'http://api.trends.bet';
                    var won = 0;
                    var odd = 0;
                    var match_id = 0;

                    if (amount != 0) {
                        if (amount > 0) {
                            description = 'برد کرش';
                        } else {
                            description = 'شروع کرش';
                        }

                        var options = {
                            method: 'POST',
                            url: url + '/api/webservices/wallet/change',
                            headers:
                            {
                                'cache-control': 'no-cache',
                                'x-access-token': user_token,
                                'content-type': 'multipart/form-data'
                            },
                            formData:
                            {
                                pid: pid,
                                user_token: user_token,
                                amount: amount,
                                description: description
                            }
                        };
                        request(options, function (error, response, body) {
                            if (error) throw new Error(error);
                        });

                        Connection.query('SELECT * FROM `poker_result` WHERE `uid` = ? ORDER BY `id` DESC LIMIT 1', [id])
                            .then(result => {
                                if (result[0] != null) {
                                    match_id = result[0].id;
                                    if (amount < 0) {
                                        //store bet

                                        won = -1;
                                        var form_data = {
                                            pid: pid,
                                            user_token: user_token,
                                            amount: amount,
                                            odd: 1,
                                            sport_name: 'dice',
                                            match_id: match_id,
                                            won: won,
                                            choice: '-'
                                        };
                                        var options = {
                                            method: 'POST',
                                            url: url + '/api/webservices/bet/store',
                                            headers: {
                                                'cache-control': 'no-cache',
                                                'x-access-token': user_token,
                                                'content-type': 'multipart/form-data'
                                            },
                                            formData: form_data
                                        };
                                        request(options, function (error, response, body) {
                                            if (error) throw new Error(error);
                                        });
                                    }
                                    else {
                                        //update bet

                                        won = 2;
                                        var form_data =
                                        {
                                            pid: pid,
                                            amount: amount,
                                            user_token: user_token,
                                            odd: 1,
                                            sport_name: 'dice',
                                            match_id: match_id,
                                            won: won,
                                        }
                                        var options = {
                                            method: 'POST',
                                            url: url + '/api/webservices/bet/update',
                                            headers: {
                                                'cache-control': 'no-cache',
                                                'x-access-token': user_token,
                                                'content-type': 'multipart/form-data'
                                            },
                                            formData: form_data
                                        };
                                        request(options, function (error, response, body) {
                                            if (error) throw new Error(error);
                                        });

                                    }
                                }
                            });
                    }

                }
            }, e => {

            });
    }
    add(a, b) {
        let p = 1000000;
        if (a < 1 || b < 1) {
            a = (a + "").substr(0, 8);
            b = (b + "").substr(0, 8);
            a = Number(a) * p;
            b = Number(b) * p;
            return (a + b) / p;
        }
        return (a + b);
    }
    fillDeck(deck) {
        deck.push('As');
        deck.push('Ks');
        deck.push('Qs');
        deck.push('Js');
        deck.push('Ts');
        deck.push('9s');
        deck.push('8s');
        deck.push('7s');
        deck.push('6s');
        deck.push('5s');
        deck.push('4s');
        deck.push('3s');
        deck.push('2s');
        deck.push('Ah');
        deck.push('Kh');
        deck.push('Qh');
        deck.push('Jh');
        deck.push('Th');
        deck.push('9h');
        deck.push('8h');
        deck.push('7h');
        deck.push('6h');
        deck.push('5h');
        deck.push('4h');
        deck.push('3h');
        deck.push('2h');
        deck.push('Ad');
        deck.push('Kd');
        deck.push('Qd');
        deck.push('Jd');
        deck.push('Td');
        deck.push('9d');
        deck.push('8d');
        deck.push('7d');
        deck.push('6d');
        deck.push('5d');
        deck.push('4d');
        deck.push('3d');
        deck.push('2d');
        deck.push('Ac');
        deck.push('Kc');
        deck.push('Qc');
        deck.push('Jc');
        deck.push('Tc');
        deck.push('9c');
        deck.push('8c');
        deck.push('7c');
        deck.push('6c');
        deck.push('5c');
        deck.push('4c');
        deck.push('3c');
        deck.push('2c');
    }
}



module.exports = Server;