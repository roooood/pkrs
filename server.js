var colyseus = require('colyseus'),
    request = require("Request"),
    autoBind = require('react-autobind'),
    pokerCalc = require('poker-calc'),
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
        this.history = [];
    }
}
class metaData {
    constructor(options) {
        this.title = options.title;
        this.id = options.id;
        this.min = Number(options.min);
        this.max = Number(options.max);
        this.sb = Number(options.sb);
        this.bb = Number(options.bb);
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
        this.regnant = null;
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
                        id: options.id,
                        title: results[0].name ,
                        min: results[0].min,
                        max: results[0].max,
                        sb: results[0].sb,
                        bb: results[0].bb,
                        player: results[0].player ,
                        type: results[0].type,
                    });
                    this.setMetadata(this.meta);
                    this.state.bet = this.meta.sb;
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
                this.checkCards();
                this.checkMessage();
            }, 3000);
        }
        for (let sit in this.state.players) {
            if (this.state.players[sit].id == client.id) {
                client.sit = sit;
                this.clock.setTimeout(() => {
                    this.send(client, { mySit: client.sit });
                }, 800);
                this.clock.setTimeout(() => {
                    this.send(client, { myCards: this.userDeck[client.sit] });
                    if (this.state.turn == client.sit) {
                        this.send(client,{ takeAction: this.state.turn })
                    }
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
                if (this.state.turn == client.sit) {
                    this.actionResult(client, value)
                }
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
        if (this.state.started && client.sit > 0) {
            this.state.players[client.sit].leave = true;
            if (consented)
            this.state.players[client.sit].state = 'fold';
        }
        this.checkState(client)
    }
    onDispose() {

    }
    sit(client, sit) {
        if (client.guest) {
            this.send(client, { guest: true });
            return;
        }
        else if (client.balance < this.meta.min) {
            this.send(client, { error: 'Balance' });
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
            if (this.state.started)
                this.state.players[sit].state = 'fold';
            else
                this.canStart();
            this.send(client, { mySit: sit });
            return true;
        }
        return false;
    }
    checkState(client) {
        let sit = client.sit || 0;
        if (sit > 0) {
            if (this.state.started) {
                this.send(client, { waitStand: true });
                this.state.players[sit].leave = true
            }
            else {
                this.standBySit(sit);
                return;
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
        }, 2000);
    }
    start() {
        this.state.started = true;
        this.newRound();
    }
    newRound() {
        this.reset();
        this.regnant = this.regnant == null ? this.randomRegnant() : this.isNext(this.regnant);
        this.broadcast({ game: 'start' });
        this.newLevel();
        this.dispatch();
        this.setTimer(this.takeAction, 3000);
    }
    takeAction() {
        if (this.ready() < 2) {
            this.state.started = false;
            return;
        }
        this.state.players[this.state.turn].type = 'D';

        this.nextTurn(false);
        this.actionIs('call', this.state.bet, false);

        if (this.meta.player > 2) {
            this.nextTurn(false);
            this.actionIs('raise', this.meta.bb,false);
        }
        this.nextTurn(false);
        this.nextAction();
    }
    nextAction() {
        // let sit = this.state.turn;
        // let id = this.state.players[sit].id;
        // let user = this.userById(id);
        // let balance = user > -1 ? this.clients[user].balance : 0;
        // let userBet = this.state.players[sit].bet || 0;
        // if (balance + userBet < this.state.bet) {
        //     this.noAction();
        // }
        // else {
            this.setTimer(this.noAction, this.setting.timer);
            this.broadcast({ takeAction: this.state.turn })
        //}
    }
    noAction() {
        this.actionIs('fold')
    }
    actionResult(client, [type, value]) {
        this.actionIs(type, value)
    }
    actionIs(type, value, action = true) {
        let sit = this.state.turn;
        this.clearTimer();

        if (!(sit in this.state.players)) {
            this.checkResult(action); 
            return;
        }
        let userBet = this.state.players[sit].bet || 0;
        let profit = this.state.players[sit].profit || 0;
        let id = this.state.players[sit].id;
        let user = this.userById(id);
        let balance = user > -1 ? this.clients[user].balance : 0;

        if ((balance + userBet < this.state.bet) && type != 'fold') {
            type = 'allin';
        }
        this.state.players[sit].state = type;
        if (type == 'fold') {
            this.checkResult(action);
        }
        else if (type == 'check') {
            if (this.state.bet != userBet) {
                type = 'fold';
                this.state.players[sit].state = 'fold';
                this.checkResult(action);
            }
            else if (action)
                this.nextTurn();
        }
        else if (type == 'call') {
            let amount = this.state.bet - userBet;
            if (balance < amount) {
                type = 'fold';
                this.state.players[sit].state = 'fold';
                this.checkResult(action);
            }
            else {
                if (amount > 0) {
                    this.state.players[sit].bet = this.state.bet;
                    this.updateUserBalance(id, balance, -amount);
                    this.state.bank = this.add(this.state.bank, amount);
                }
                if (action)
                this.nextTurn();
            }
        }
        else if (type == 'raise') {
            let max = balance >= this.meta.max ? this.meta.max + profit : balance;
            if (max > balance) {
                max = balance;
            }

            value = Number(value);
            let amount = value + userBet;
            if (max >= value) {
                this.state.bet = amount;
                this.updateUserBalance(id, balance, - value);
                this.state.players[sit].bet = amount;
                this.state.bank = this.add(this.state.bank, value);
                if(action)
                this.nextTurn();
            }
            else {
                type = 'fold';
                this.state.players[sit].state = 'fold';
                this.checkResult(action);
            }

        }
        else if (type == 'allin') {
            let max = balance >= this.meta.max ? this.meta.max + profit  : balance;
            if (max < balance) {
                max = balance;
            }

            let amount = this.state.bet - userBet;
            let value = max - amount;
            if (value > 0) {
                this.state.players[sit].bet += max; 
                this.state.bet += value;
                this.state.bank = this.add(this.state.bank, value);
            }
            else {
                this.state.players[sit].bet = userBet + max; 
                this.state.bank = this.add(this.state.bank, max);
            }
            this.updateUserBalance(id, balance, -max);
            if (action)
            this.nextTurn();
        }
        this.broadcast({ actionIs: [sit, type] })
    }
    nextTurn(action=true) {
        let turn = this.state.turn;
        let newTurn = false, end = 9;
        for (let i = 1; i < end; i++) {
            let next = (turn + i) % end;
            next = next === 0 ? end : next;
            if (next in this.state.players) {
                if (!(['fold', 'allin'].includes(this.state.players[next].state))) {
                    let userBet = this.state.players[next].bet || 0;
                    if (userBet < this.state.bet) {
                        newTurn = next;
                        break;
                    }
                    else if (this.state.players[next].state == 'new') {
                        newTurn = next;
                        break;
                    }
                }
            }
        }

        if (newTurn === false) {
            this.checkLevel()
        }
        else {
            this.state.turn = newTurn;
            if (action)
            this.nextAction();
        }
    }
    isNext(turn) {
        let end = 9;
        for (let i = 1; i < end; i++) {
            let next = (turn + i) % end;
            next = next === 0 ? end : next;
            if (next in this.state.players) {
                    return next;
            }
        }
        return false;
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
        this.broadcast({ newLevel: this.level });
        let count = 0;
        for (let i in this.state.players) {
            if (!(['fold', 'allin'].includes(this.state.players[i].state))) {
                this.state.players[i].state = 'new';
                count++;
            }
        }
        if (count == 1) {
            this.addtoDeck(true);
            this.preResult();
        }
        else {        
            this.state.turn = this.regnant;
            if (['fold', 'allin'].includes(this.state.players[this.regnant].state)) {
                this.nextTurn(false);
            }
            this.level++;
        }
    }
    checkResult(action) {
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
        else {
            if (action)
                this.nextTurn();
        }

    }
    returnBalance() {
        for (let sit in this.state.players) {
            if (this.state.players[sit].bet > 0) {
                let id = this.state.players[sit].id;
                let user = this.userById(id);
                let balance = user > -1 ? this.clients[user].balance : 0;
                this.updateUserBalance(id, balance, this.state.players[sit].bet);
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
                            this.clock.setTimeout(() => this.result(id), 1500);
                        });
                });

        } else {
            this.reset();
        }
    }
    result(xid) {
        let sit, wins = {}, id, user, balance, state, winner;
        let playerCards = [], boardCards = this.deck.slice(0, 5);
        for (sit in this.state.players) {
            if (this.state.players[sit].state != 'fold') {
                playerCards.push({
                    playerId: sit, cards: this.userDeck[sit]
                })
            }
        }
        if (this.meta.type == 'holdem') {
            winner = pokerCalc.getHoldemWinner({ boardCards, playerCards }, { compactCards: true });
        }
        else {
            winner = pokerCalc.getOmahaWinner({ boardCards, playerCards }, { compactCards: true });
        }
        let commission = (Number(this.setting.commission) * this.state.bank) / 100;
        let amount = this.add(this.state.bank, -commission);
        amount /= winner.length;
        amount = parseFloat(amount.toFixed(2));
        for (let win of winner) {
            let sit = win.playerId;
            user = this.userBySit(sit);
            id = this.state.players[sit].id;
            balance = user > -1 ? this.clients[user].balance : 0;
            this.updateUserBalance(id, balance, amount);    
            wins[sit] = [
                win.hand.cards.map(i => i.replace('S', 's').replace('H', 'h').replace('C', 'c').replace('D', 'd')),
                this.userDeck[sit],
                win.hand.handInfo
            ];      
        }

        for (sit in this.state.players) {
            user = this.userBySit(sit);
            if (sit in wins) {
                state = true;
                if (user > -1)
                    this.send(this.clients[user], { win: amount });
            }
            else if (this.state.players[sit].bet > 0){
                state = false;
                if (user > -1)
                    this.send(this.clients[user], { lose: this.state.players[sit].bet });
            }

            let result = {
                pid: xid,
                uid: this.state.players[sit].id,
                cash: state ? (amount||0) : (this.state.players[sit].bet||0),
                type: state ? 'win' : 'lose'
            }
            Connection.query('INSERT INTO `poker_result` SET ?', result);
        }
        this.broadcast({ gameResult:  wins});
        this.checkCards();

        this.setTimer(this.over, (Object.keys(wins).length*4500)-1000);
    }
    sendToPlayer(option) {
        for (let client in this.clients) {
            if ('sit' in this.clients[client]) {
                this.send(this.clients[client], option);
            }
        }
    }
    reset() {
        this.state.deck = {};
        this.userDeck = {};
        this.level = 0;
        this.state.turn = null;
        this.state.bank = 0;
        this.state.bet = this.meta.sb;
        this.state.deck = [];
        this.broadcast({ reset: true });
        this.checkLeave();
        let i,sit;
        for (i in this.state.players) {
            delete this.state.players[i].state;
            delete this.state.players[i].bet;
            delete this.state.players[i].type;
            sit = this.userBySit(i);
            if (sit > -1) {
                this.send(this.clients[sit], { myCards: [] });
            }
        }
    }
    over() {
        // this.returnBalance();
        this.state.started = false;
        this.clearTimer();
        this.reset();
        this.setTimer(this.canStart, 1000);
    }
    checkLeave() {
        let check = false;
        for (let i in this.state.players) {
            if ('leave' in this.state.players[i] || this.state.players[i].balance < this.meta.sb) {
                let sit = this.userBySit(i);
                this.send(this.clients[sit], { waitStand: false });
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
        this.shuffle();
        this.chunk();

        let cards = {
            tid : this.meta.id,
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
        let size = this.meta.type == 'holdem' ? 2 : 4;
        let i, start, end;
        for (i = 1; i <= 9; i++) {
            start = (i * size) + 10;
            end = start + size;
            this.userDeck[i] = this.deck.slice(start, end);
        }
    }
    addtoDeck(all = false) {
        if (all) {
            this.state.deck = this.deck.slice(0, 5);
        }
        else {       
            let len = this.state.deck.length;
            let end = len == 0 ? 3 : (len == 3 ? 4 : 5);
            this.state.deck = this.deck.slice(0, end);
        }

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
    checkCards() {
        let len = 15;
        Connection.query('SELECT `poker_cards`.*,`poker_points`.`bank` FROM `poker_cards` LEFT JOIN `poker_points`  ON `poker_points`.`cardId`=`poker_cards`.`id` WHERE `poker_cards`.`tid` = ? AND `poker_points`.`bank`>0 ORDER BY `poker_cards`.`id` DESC LIMIT ?', [this.meta.id, len])
            .then(results => {
                let res, data = [];
                for (res of results) {
                    data.push({
                        id: res.id,
                        cards: res.cards,
                        bank: res.bank
                    })
                }
                this.state.history = data; 
            });
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
        for (let sit in this.state.players) {
            if (this.state.players[sit].id == id) {
                if (amount > 0) {
                    this.state.players[sit].profit = this.add((this.state.players[sit].profit||0), amount)
                }
                this.state.players[sit].balance = this.add(this.state.players[sit].balance , amount)
            }
        }
        if (user > -1) {
            this.clients[user].balance = this.add(this.clients[user].balance, amount);
            this.send(this.clients[user], { balance: [balance, amount] });
        }
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
        deck.push('10s');
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
        deck.push('10h');
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
        deck.push('10d');
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
        deck.push('10c');
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