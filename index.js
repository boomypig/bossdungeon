const WebSocket = require('ws')
const express = require('express')


const app = express();
app.use(express.static('public'));

const server = app.listen(3000,function(){
    console.log("Server is ready....")
});
//This makes a websocket server with support of the http on port 3000
//this lets me make http request while also being able to use web socket requests
const wss = new WebSocket.WebSocketServer({server:server})

//DATA POINTS HEREE ---------------------------------
let playercount = 0;
let host = null; 
let gamestarted = false;
let gameState = {
  players: [],
  currentPlayer: null,
  currentTurn: 0,
  gameOver: false,
  currentBoss: null,
  bossPool: [
    {
      id: 1,
      name: "Goblin King",
      maxHp: 100,
      currentHp: 100,
      damage: 10,
      xpReward: 50,
      statusEffects: {
        stun: { chance: 0.15, duration: 1 }
      },
      specialAbilities: [
        {
          name: "Goblin Horde",
          description: "Summons a horde of goblins to attack all players",
          trigger: "hpBelow50",
          damageMultiplier: 0.5,
          message: "The Goblin King calls for reinforcements! All players take damage!"
        }
      ]
    },
    {
      id: 2,
      name: "Dragon",
      maxHp: 200,
      currentHp: 200,
      damage: 20,
      xpReward: 100,
      statusEffects: {
        poison: { chance: 0.2, duration: 2 }
      },
      specialAbilities: [
        {
          name: "Dragon's Breath",
          description: "Breathes fire on all players",
          trigger: "hpBelow50",
          damageMultiplier: 1.5,
          message: "The Dragon unleashes its fiery breath! All players take massive damage!"
        },
        {
          name: "Wing Buffet",
          description: "Knocks back all players",
          trigger: "every3Turns",
          turnCounter: 0,
          message: "The Dragon flaps its mighty wings, stunning all players!"
        }
      ]
    },
    {
      id: 3,
      name: "Dark Wizard",
      maxHp: 150,
      currentHp: 150,
      damage: 15,
      xpReward: 75,
      statusEffects: {
        shield: { chance: 0.3, duration: 2 }
      },
      specialAbilities: [
        {
          name: "Dark Ritual",
          description: "Heals itself and gains power",
          trigger: "hpBelow30",
          healAmount: 50,
          damageMultiplier: 2,
          message: "The Dark Wizard performs a dark ritual, healing itself and growing stronger!"
        },
        {
          name: "Curse of Shadows",
          description: "Curses all players",
          trigger: "every2Turns",
          turnCounter: 0,
          message: "The Dark Wizard casts a powerful curse on all players!"
        }
      ]
    }
  ],
  turnOrder: [],
  isBossTurn: false
};

const classStats = {
  Samurai: {
    baseHp: 120,
    baseDamage: 15,
    baseMana: 100,
    specialAbilities: [
      {
        name: "Double Strike",
        description: "Strikes twice with normal damage",
        manaCost: 30,
        damageMultiplier: 1,
        hits: 2
      },
      {
        name: "Precision Strike",
        description: "A precise attack with increased critical chance",
        manaCost: 40,
        damageMultiplier: 1.2,
        criticalChance: 0.5
      },
      {
        name: "Blade Storm",
        description: "A powerful spinning attack",
        manaCost: 60,
        damageMultiplier: 1.8,
        hits: 1
      }
    ],
    description: "A balanced warrior with high HP",
    levelUpStats: {
      hp: 15,
      damage: 5,
      mana: 20
    }
  },
  Warrior: {
    baseHp: 100,
    baseDamage: 20,
    baseMana: 80,
    specialAbilities: [
      {
        name: "Two Turn Attack",
        description: "Attacks twice in one turn",
        manaCost: 25,
        damageMultiplier: 1,
        hits: 2
      },
      {
        name: "Brutal Strike",
        description: "A devastating attack with high critical chance",
        manaCost: 45,
        damageMultiplier: 1.5,
        criticalChance: 0.4
      },
      {
        name: "Rage Strike",
        description: "A powerful attack that increases berserk chance",
        manaCost: 50,
        damageMultiplier: 1.3,
        berserkChance: 0.5
      }
    ],
    statusEffects: {
      berserk: { chance: 0.3, duration: 2 }
    },
    description: "A powerful attacker who can go berserk, dealing more damage but taking more in return",
    levelUpStats: {
      hp: 10,
      damage: 7,
      mana: 15
    }
  },
  Astrologer: {
    baseHp: 80,
    baseDamage: 25,
    baseMana: 150,
    specialAbilities: [
      {
        name: "Magic Burst",
        description: "A powerful magical attack",
        manaCost: 35,
        damageMultiplier: 2.5,
        hits: 1
      },
      {
        name: "Arcane Missiles",
        description: "Fires multiple magical projectiles",
        manaCost: 40,
        damageMultiplier: 1.2,
        hits: 3
      },
      {
        name: "Starfall",
        description: "Calls down celestial energy",
        manaCost: 70,
        damageMultiplier: 3,
        poisonChance: 0.6
      }
    ],
    statusEffects: {
      poison: { chance: 0.4, duration: 3 }
    },
    description: "A fragile mage with high damage and the ability to poison enemies",
    levelUpStats: {
      hp: 8,
      damage: 8,
      mana: 25
    }
  },
  Prophet: {
    baseHp: 90,
    baseDamage: 10,
    baseMana: 120,
    baseHealing: 40,
    specialAbilities: [
      {
        name: "Heal",
        description: "Restores health to target",
        manaCost: 30,
        healMultiplier: 1.0,
        hits: 1
      },
      {
        name: "Divine Wrath",
        description: "Deals holy damage to the enemy",
        manaCost: 40,
        damageMultiplier: 1.8,
        hits: 1
      }
    ],
    statusEffects: {
      shield: { chance: 0.25, duration: 2 }
    },
    description: "A support class that can heal allies and provide protective shields",
    levelUpStats: {
      hp: 12,
      damage: 4,
      mana: 20,
      healing: 8
    }
  }
};

// Status effect definitions
const statusEffectDefinitions = {
  poison: {
    name: "Poison",
    description: "Takes damage over time",
    color: "#4CAF50",
    apply: (target) => {
      target.statusEffects = target.statusEffects || {};
      target.statusEffects.poison = { duration: 3, damage: Math.floor(target.maxHp * 0.1) };
    },
    process: (target) => {
      if (target.statusEffects?.poison) {
        target.currentHp = Math.max(0, target.currentHp - target.statusEffects.poison.damage);
        target.statusEffects.poison.duration--;
        if (target.statusEffects.poison.duration <= 0) {
          delete target.statusEffects.poison;
        }
      }
    }
  },
  shield: {
    name: "Shield",
    description: "Reduces incoming damage by 50%",
    color: "#2196F3",
    apply: (target) => {
      target.statusEffects = target.statusEffects || {};
      target.statusEffects.shield = { duration: 2 };
    },
    process: (target, damage) => {
      if (target.statusEffects?.shield) {
        target.statusEffects.shield.duration--;
        if (target.statusEffects.shield.duration <= 0) {
          delete target.statusEffects.shield;
        }
        return Math.floor(damage * 0.5);
      }
      return damage;
    }
  },
  berserk: {
    name: "Berserk",
    description: "Deals 50% more damage but takes 25% more damage",
    color: "#F44336",
    apply: (target) => {
      target.statusEffects = target.statusEffects || {};
      target.statusEffects.berserk = { duration: 2 };
    },
    process: (target, damage, isAttacking) => {
      if (target.statusEffects?.berserk) {
        target.statusEffects.berserk.duration--;
        if (target.statusEffects.berserk.duration <= 0) {
          delete target.statusEffects.berserk;
        }
        if (isAttacking) {
          return Math.floor(damage * 1.5); 
        } else {
          return Math.floor(damage * 1.25);
        }
      }
      return damage;
    }
  }
};
//DATA ENDS HERE ---------------------------------------------

wss.on('connection', function connection(ws) {
    console.log("client connectected", playercount)

    if(host){ //check if there is a host socket if there isn't button shows
        ws.send(JSON.stringify({ //if there is a host just make all the clients know that there is a host
            host:true,          //hides host button
        }))
    }


     //ws is the client that has connected
     //this happens when there is any type of error 
      ws.on('error', function(err){
        console.error("erreor with socket", err)
      });

    ws.send(JSON.stringify({
            playerNumber : playercount,
            log:"playerNumber is saved"
          }));
    playercount += 1;

    

  const actions = {
    joinGame: joinGame,
    startGame:startGame,
    attack: handleAttack
  }

    //send a welcome message when a client connects
    //Client sent the server a message
  ws.on('message', function message(data) {
    console.log("recieved message from client!");
    let message = JSON.parse(data) //message(the json data) that we get from the front from clients interactions
    console.log("message was parsed");


    if (message.action == 'setHost'){
        host = {socket: ws}; //ws is the client technically client 0 who is the host
        // Broadcast to all clients that there is now a host
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    log: client === ws ? "You are the host" : "Host has been set",
                    players: gameState.players,
                    page: client === ws ? "lobbyHost" : "lobby",
                    host: true
                }));
            }
        });
        console.log("host has been set")
    }
    else if(message.action == 'setPlayer'){
        ws.send(JSON.stringify({
        log:"you are a player",
        page:"lobbyPlayer"    
       }))
    };
    if(actions[message.action]){
      actions[message.action](message, ws)
    }else{
      console.log("unknown action", message.action)
    }
    // Create a clean copy of player data without socket references
    let cleanPlayers = gameState.players.map(player => {
      const { socket, ...cleanPlayer } = player;
      return cleanPlayer;
    });
    
    let updateData = {
      players: cleanPlayers,
      log: "updated player data"
    }
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(updateData));
      }
    });

    //generate a unique id and store it in local storage 

    //THIS SENDS A MESSAGE TO ALL THE CLIENTS IN THE CONNECTED SERVER except to current client
   
  });

  
  ws.on('close',function(data){
    if (host && ws === host.socket) {
      // Host disconnected - reset game state but don't close connections
      console.log("Host has been disconnected - resetting game");
      
      // Reset game state
      gameState = {
        players: [],
        currentPlayer: null,
        currentTurn: 0,
        gameOver: false,
        currentBoss: null,
        bossPool: gameState.bossPool,
        turnOrder: [],
        isBossTurn: false
      };
      
      // Notify all clients about host disconnection
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            action: "hostDisconnected",
            message: "Host has disconnected. Game will reset.",
            page: "lobby",
            host: false
          }));
        }
      });
      
      // Reset host
      host = null;
      playercount = 0;
    } else {
      console.log("player has disconnected")
      // Remove disconnected player from gameState
      gameState.players = gameState.players.filter(p => p.socket !== ws);
      // Broadcast updated player list
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            players: gameState.players
          }));
        }
      });
    }
  });

});

function joinGame(message,ws){
  let player = {
    name: message.playerName,
    class: message.playerClass,
    number: message.playerNumber,
    level: 1,
    xp: 0,
    maxHp: classStats[message.playerClass].baseHp,
    currentHp: classStats[message.playerClass].baseHp,
    maxMana: classStats[message.playerClass].baseMana,
    currentMana: classStats[message.playerClass].baseMana,
    damage: classStats[message.playerClass].baseDamage,
    healing: classStats[message.playerClass].baseHealing || 0,
    specialAbilities: classStats[message.playerClass].specialAbilities,
    socket: ws
  }
  gameState.players.push(player)
  ws.send(JSON.stringify({
    players: gameState.players,
    log: "player joined game",
    page: "startLobby",
    playerStats: player
  }))
  console.log("player joined game", gameState.players)
};

function startGame(message,ws){
  if (ws === host.socket) {
    gameState.gameStarted = true;
    gameState.turnOrder = [...gameState.players];
    gameState.currentPlayer = gameState.turnOrder[0];
    spawnNewBoss();
    
    const cleanPlayers = gameState.players.map(player => {
      const { socket, ...cleanPlayer } = player;
      return cleanPlayer;
    });
    
    const cleanTurnOrder = gameState.turnOrder.map(player => {
      const { socket, ...cleanPlayer } = player;
      return cleanPlayer;
    });
    
    const cleanCurrentPlayer = gameState.currentPlayer ? {
      ...gameState.currentPlayer,
      socket: undefined
    } : null;
    
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          action: "gameStarted",
          players: cleanPlayers,
          currentBoss: gameState.currentBoss,
          currentPlayer: cleanCurrentPlayer,
          turnOrder: cleanTurnOrder
        }));
      }
    });
  }
}

function spawnNewBoss() {
  const randomBoss = gameState.bossPool[Math.floor(Math.random() * gameState.bossPool.length)];
  gameState.currentBoss = {
    ...randomBoss,
    currentHp: randomBoss.maxHp,
    statusEffects: {}
  };
  return gameState.currentBoss;
}

function handleAttack(message, ws) {
  const player = gameState.players.find(p => p.socket === ws);
  if (!player || !gameState.currentBoss || player !== gameState.currentPlayer || gameState.isBossTurn) return;

  // Calculate damage
  let damage = player.damage;
  let healAmount = 0;
  let targetPlayer = null;
  let statusEffect = null;
  let criticalHit = false;
  let abilityUsed = null;
  
  if (message.useSpecial) {
    const abilityIndex = message.abilityIndex || 0;
    abilityUsed = player.specialAbilities[abilityIndex];
    
    if (!abilityUsed || player.currentMana < abilityUsed.manaCost) {
      return; // Not enough mana or invalid ability
    }
    
    // Deduct mana
    player.currentMana -= abilityUsed.manaCost;
    
    switch(player.class) {
      case 'Samurai':
        if (abilityIndex === 0) { // Double Strike
          damage *= abilityUsed.damageMultiplier;
          damage *= abilityUsed.hits;
        } else if (abilityIndex === 1) { // Precision Strike
          damage *= abilityUsed.damageMultiplier;
          if (Math.random() < abilityUsed.criticalChance) {
            damage *= 2;
            criticalHit = true;
          }
        } else if (abilityIndex === 2) { // Blade Storm
          damage *= abilityUsed.damageMultiplier;
        }
        break;
      case 'Warrior':
        if (abilityIndex === 0) { // Two Turn Attack
          damage *= abilityUsed.damageMultiplier;
          damage *= abilityUsed.hits;
        } else if (abilityIndex === 1) { // Brutal Strike
          damage *= abilityUsed.damageMultiplier;
          if (Math.random() < abilityUsed.criticalChance) {
            damage *= 2;
            criticalHit = true;
          }
        } else if (abilityIndex === 2) { // Rage Strike
          damage *= abilityUsed.damageMultiplier;
          if (Math.random() < abilityUsed.berserkChance) {
            statusEffect = 'berserk';
            statusEffectDefinitions.berserk.apply(player);
          }
        }
        break;
      case 'Astrologer':
        if (abilityIndex === 0) { // Magic Burst
          damage *= abilityUsed.damageMultiplier;
        } else if (abilityIndex === 1) { // Arcane Missiles
          damage *= abilityUsed.damageMultiplier;
          damage *= abilityUsed.hits;
        } else if (abilityIndex === 2) { // Starfall
          damage *= abilityUsed.damageMultiplier;
          if (Math.random() < abilityUsed.poisonChance) {
            statusEffect = 'poison';
            statusEffectDefinitions.poison.apply(gameState.currentBoss);
          }
        }
        break;
      case 'Prophet':
  if (abilityIndex === 0) { // Heal
    healAmount = Math.floor(player.healing * abilityUsed.healMultiplier);
    damage = 0;
    if (message.targetPlayer) {
      targetPlayer = gameState.players.find(p => p.name === message.targetPlayer);
    } else {
      targetPlayer = player;
    }
    // Apply healing to the target player
    if (targetPlayer) {
      targetPlayer.currentHp = Math.min(targetPlayer.maxHp, targetPlayer.currentHp + healAmount);
    }
  } else if (abilityIndex === 1) { // Divine Wrath
    targetPlayer = null;
    
    damage *= abilityUsed.damageMultiplier;
  }
  break;
    }
  }

  // Apply status effects from boss
  if (gameState.currentBoss.statusEffects) {
    for (const [effect, data] of Object.entries(gameState.currentBoss.statusEffects)) {
      if (Math.random() < data.chance) {
        statusEffectDefinitions[effect].apply(player);
      }
    }
  }

  // Process any active status effects
  statusEffectDefinitions.poison.process(player);
  damage = statusEffectDefinitions.berserk.process(player, damage, true);
  damage = statusEffectDefinitions.shield.process(gameState.currentBoss, damage);

  // Apply damage to boss if any
  if (damage > 0) {
    gameState.currentBoss.currentHp -= damage;
  }
  
  // Check if boss is defeated
  if (gameState.currentBoss.currentHp <= 0) {
    // Award XP to all players
    gameState.players.forEach(p => {
      p.xp += gameState.currentBoss.xpReward;
      // Check for level up
      const xpNeeded = p.level * 100;
      if (p.xp >= xpNeeded) {
        p.level++;
        const classInfo = classStats[p.class];
        p.maxHp += classInfo.levelUpStats.hp;
        p.currentHp = p.maxHp;
        p.maxMana += classInfo.levelUpStats.mana;
        p.currentMana = p.maxMana;
        p.damage += classInfo.levelUpStats.damage;
        if (classInfo.levelUpStats.healing) {
          p.healing += classInfo.levelUpStats.healing;
        }
        p.xp -= xpNeeded;
      }
    });
    
    // Spawn new boss
    spawnNewBoss();
  }

  // Move to next turn
  gameState.isBossTurn = true;
  
  // Broadcast updated game state
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      // Create clean copies without socket references
      const cleanPlayers = gameState.players.map(p => {
        const { socket, ...cleanPlayer } = p;
        return cleanPlayer;
      });

      const cleanCurrentPlayer = gameState.currentPlayer ? {
        ...gameState.currentPlayer,
        socket: undefined
      } : null;

      client.send(JSON.stringify({
        action: "gameUpdate",
        players: cleanPlayers,
        currentBoss: gameState.currentBoss,
        lastAction: {
          player: player.name,
          damage: damage,
          heal: healAmount,
          usedSpecial: message.useSpecial,
          ability: abilityUsed?.name,
          class: player.class,
          target: targetPlayer ? targetPlayer.name : null,
          statusEffect: statusEffect,
          statusMessage: statusEffect ? `${player.name} applied ${statusEffect} to ${targetPlayer ? targetPlayer.name : gameState.currentBoss.name}!` : null,
          criticalHit: criticalHit
        },
        isBossTurn: true
      }));
    }
  });

  // Boss turn after a short delay
  setTimeout(() => {
    handleBossTurn();
  }, 2000);
}

function handleBossTurn() {
  if (!gameState.currentBoss || !gameState.isBossTurn) return;

  // Process any active status effects on boss
  statusEffectDefinitions.poison.process(gameState.currentBoss);

  // Check for special abilities
  let specialAbilityUsed = false;
  let specialAbilityMessage = null;
  let damageMultiplier = 1;

  if (gameState.currentBoss.specialAbilities) {
    for (const ability of gameState.currentBoss.specialAbilities) {
      if (ability.trigger === "hpBelow50" && gameState.currentBoss.currentHp <= gameState.currentBoss.maxHp * 0.5) {
        if (Math.random() < 0.5) {
          specialAbilityUsed = true;
          specialAbilityMessage = ability.message;
          damageMultiplier = ability.damageMultiplier || 1;
          if (ability.healAmount) {
            gameState.currentBoss.currentHp = Math.min(
              gameState.currentBoss.maxHp,
              gameState.currentBoss.currentHp + ability.healAmount
            );
          }
          break;
        }
      } else if (ability.trigger === "hpBelow30" && gameState.currentBoss.currentHp <= gameState.currentBoss.maxHp * 0.3) {
        if (Math.random() < 0.75) {
          specialAbilityUsed = true;
          specialAbilityMessage = ability.message;
          damageMultiplier = ability.damageMultiplier || 1;
          if (ability.healAmount) {
            gameState.currentBoss.currentHp = Math.min(
              gameState.currentBoss.maxHp,
              gameState.currentBoss.currentHp + ability.healAmount
            );
          }
          break;
        }
      } else if (ability.trigger === "every2Turns" || ability.trigger === "every3Turns") {
        const turnInterval = ability.trigger === "every2Turns" ? 2 : 3;
        ability.turnCounter = (ability.turnCounter || 0) + 1;
        if (ability.turnCounter >= turnInterval) {
          specialAbilityUsed = true;
          specialAbilityMessage = ability.message;
          damageMultiplier = ability.damageMultiplier || 1;
          ability.turnCounter = 0;
          break;
        }
      }
    }
  }

  // Boss attacks all players if special ability is used, otherwise attacks random player
  const targets = specialAbilityUsed ? gameState.players : [gameState.players[Math.floor(Math.random() * gameState.players.length)]];
  let totalDamage = 0;

  for (const target of targets) {
    let damage = Math.floor(gameState.currentBoss.damage * damageMultiplier);

    // Process status effects for damage calculation
    damage = statusEffectDefinitions.berserk.process(target, damage, false);
    damage = statusEffectDefinitions.shield.process(target, damage);

    // Apply boss's status effect chance
    if (gameState.currentBoss.statusEffects) {
      for (const [effect, data] of Object.entries(gameState.currentBoss.statusEffects)) {
        if (Math.random() < data.chance) {
          statusEffectDefinitions[effect].apply(target);
        }
      }
    }

    target.currentHp = Math.max(0, target.currentHp - damage);
    totalDamage += damage;

    // Check if player is defeated
    if (target.currentHp <= 0) {
      target.currentHp = target.maxHp; // Reset HP for now (could implement death mechanics later)
    }
  }

  // Move to next player's turn
  gameState.isBossTurn = false;
  const currentIndex = gameState.turnOrder.indexOf(gameState.currentPlayer);
  const nextIndex = (currentIndex + 1) % gameState.turnOrder.length;
  gameState.currentPlayer = gameState.turnOrder[nextIndex];

  // Broadcast updated game state
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      // Create clean copies without socket references
      const cleanPlayers = gameState.players.map(p => {
        const { socket, ...cleanPlayer } = p;
        return cleanPlayer;
      });

      const cleanCurrentPlayer = gameState.currentPlayer ? {
        ...gameState.currentPlayer,
        socket: undefined
      } : null;

      client.send(JSON.stringify({
        action: "gameUpdate",
        players: cleanPlayers,
        currentBoss: gameState.currentBoss,
        lastAction: {
          boss: gameState.currentBoss.name,
          damage: totalDamage,
          targets: targets.map(t => t.name),
          specialAbility: specialAbilityUsed,
          specialMessage: specialAbilityMessage
        },
        currentPlayer: cleanCurrentPlayer,
        isBossTurn: false
      }));
    }
  });
}
