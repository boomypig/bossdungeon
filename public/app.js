Vue.createApp({
    data:function(){
        return{
            //data properties here
            page:"lobby",
            socket:null,
            player:null, //each client when they open a tab its an object
            playerNumber:null,
            host:false,
            myClass: "", //class of the player whether they are Prophet(healer), Samuria(basic/tankish), Warrior(two turn attack), Astrologiro (mage)
            players:[], //list of players
            playersNameInput:"",   
            messageFromBack: null, 
            currentBoss: null,
            lastAction: null,
            playerStats: null,
            currentPlayer: null,
            isBossTurn: false,
            turnOrder: [],
            selectedHealTarget: null,
            showHealTargets: false,
            statusEffectDefinitions: {
                stun: { name: "Stun", color: "#FF9800" },
                poison: { name: "Poison", color: "#4CAF50" },
                shield: { name: "Shield", color: "#2196F3" },
                berserk: { name: "Berserk", color: "#F44336" }
            }
        }
    },
    methods:{
        connectSocket: function(){
            this.socket = new WebSocket("https://bossdungeon.onrender.com");
            this.socket.addEventListener("message", message => {
                this.socketReceived(JSON.parse(message.data))
            });
            
            this.socket.addEventListener("error", (error) => {
                console.error("WebSocket error:", error);
            });
            
            this.socket.addEventListener("close", () => {
                console.log("WebSocket connection closed");
                setTimeout(() => {
                    this.connectSocket();
                }, 1000);
            });

            this.socket.addEventListener("open", () => {
                console.log("WebSocket connection established");
                // Reset state when reconnecting
                this.page = "lobby";
                this.host = false;
                this.myClass = "";
                this.playersNameInput = "";
            });
        },
        socketReceived: function(message){
            console.log("message received ", message);
            this.messageFromBack = message;
    
    for (let [key,value] of Object.entries(message)){
        this[key] = value;
    }
    
    if(message.log){
        console.log(this.log);
    }
    
    // Add this section to ensure Prophet always has exactly 2 abilities
    if (message.playerStats) {
        this.playerStats = message.playerStats;
        
        // Ensure Prophet only has 2 abilities if somehow more got added
        if (this.playerStats.class === 'Prophet' && 
            this.playerStats.specialAbilities && 
            this.playerStats.specialAbilities.length > 2) {
            console.log("Fixing Prophet abilities - limiting to 2");
            this.playerStats.specialAbilities = this.playerStats.specialAbilities.slice(0, 2);
        }
    }
            if (message.action === "gameStarted") {
                this.page = "battle";
            }
            if (message.action === "hostDisconnected") {
                this.page = "lobby";
                this.players = [];
                this.playerStats = null;
                this.currentBoss = null;
                this.currentPlayer = null;
                this.isBossTurn = false;
                this.turnOrder = [];
                this.host = false;
                this.myClass = ""; // Reset class selection
                this.playersNameInput = ""; // Reset name input
                alert(message.message);
            }
            if (message.playerStats) {
                this.playerStats = message.playerStats;
            }
            // Update player stats from the players array if it exists
            if (message.players && this.playerStats) {
                const updatedPlayer = message.players.find(p => p.name === this.playerStats.name);
                if (updatedPlayer) {
                    this.playerStats = updatedPlayer;
                }
            }
        },
        sendToSocket: function(data){
            this.socket.send(JSON.stringify(data))
        },
        hostButton: function(){
            console.log("host button clicked")
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                let toSend = {
                    action: "setHost"
                }
                this.sendToSocket(toSend)
            } else {
                console.error("Socket not connected")
            }
        },
        playerButton: function(){
            console.log("player button clicked")
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                let toSend = {
                    action: "setPlayer"
                }
                this.sendToSocket(toSend)
            } else {
                console.error("Socket not connected")
            }
        },

        joinGame: function(){
            if (this.myClass === 'Prophet') {
                console.log("Prophet selected - 2 abilities only");
            }
            
            let toSend = {
                action: "joinGame",
                playerName: this.playersNameInput,
                playerClass: this.myClass,
                playerNumber: this.playerNumber
            };
            this.sendToSocket(toSend);
            this.page = "startLobby";
        },
        startGame: function(){
            console.log("starting game")
            let toSend = {
                action: "startGame"
            }
            this.sendToSocket(toSend)
        },
        attack: function(useSpecial = false, abilityIndex = 0) {
            let toSend = {
                action: "attack",
                useSpecial: useSpecial,
                abilityIndex: abilityIndex
            }
            
            if (useSpecial && this.playerStats?.class === 'Prophet' && 
                abilityIndex === 0 && this.selectedHealTarget) {
                toSend.targetPlayer = this.selectedHealTarget;
            }
            
            this.sendToSocket(toSend);
            this.showHealTargets = false;
            this.selectedHealTarget = null;
        },
        
        handleProphetAbility: function(abilityIndex) {
            if (abilityIndex === 0) { // Heal
                this.showHealTargets = true;
                this.selectedHealTarget = null; // Reset selected target
            } else if (abilityIndex === 1) { 
                this.attack(true, 1); // Target boss
            }
        },
        calculateXpPercentage: function() {
            if (!this.playerStats) return 0;
            const xpNeeded = this.playerStats.level * 100;
            return (this.playerStats.xp / xpNeeded) * 100;
        },
        isMyTurn: function() {
            return this.currentPlayer && this.playerStats && 
                   this.currentPlayer.name === this.playerStats.name && !this.isBossTurn;
        },
        toggleHealTargets: function() {
            if (this.playerStats?.class === 'Prophet') {
                this.showHealTargets = !this.showHealTargets;
            }
        },
        selectHealTarget: function(playerName) {
            this.selectedHealTarget = playerName;
            this.attack(true, 0); // Use Heal (0)
            this.showHealTargets = false;
        },
        getStatusEffects: function(entity) {
            if (!entity || !entity.statusEffects) return [];
            return Object.entries(entity.statusEffects).map(([effect, data]) => ({
                name: this.statusEffectDefinitions[effect].name,
                color: this.statusEffectDefinitions[effect].color,
                duration: data.duration
            }));
        }
    },
    computed: {
        availableHealTargets: function() {
            return this.players.filter(p => p.name !== this.playerStats?.name);
        }
    },
    created: function(){
        console.log("vue app loaded")
        this.connectSocket()
    }
}).mount("#app")