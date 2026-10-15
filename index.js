const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder 
} = require('discord.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());

const JSON_PATH = path.join(__dirname, 'users.json');
const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/your-link-here";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://key-system-7mt3.onrender.com";

function loadData() {
    try {
        if (!fs.existsSync(JSON_PATH)) {
            fs.writeFileSync(JSON_PATH, JSON.stringify({ progress: {}, activeKeys: {} }, null, 2));
        }
        const data = fs.readFileSync(JSON_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error loading users.json:", err);
        return { progress: {}, activeKeys: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving users.json:", err);
    }
}

// -------------------------------------------------------------
// 1. DISCORD BOT SETUP
// -------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Select key duration and complete checkpoints')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully registered /getkey!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    // Handle /getkey slash command
    if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
        await interaction.deferReply({ ephemeral: true });

        const durationSelect = new StringSelectMenuBuilder()
            .setCustomId('select_key_duration')
            .setPlaceholder('Choose your key duration...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('12 Hours').setDescription('1 Checkpoint').setValue('12_1'),
                new StringSelectMenuOptionBuilder().setLabel('24 Hours').setDescription('2 Checkpoints').setValue('24_2'),
                new StringSelectMenuOptionBuilder().setLabel('48 Hours').setDescription('3 Checkpoints').setValue('48_3'),
                new StringSelectMenuOptionBuilder().setLabel('72 Hours').setDescription('4 Checkpoints').setValue('72_4')
            );

        const row = new ActionRowBuilder().addComponents(durationSelect);

        await interaction.editReply({
            content: '🔑 **Select your key duration below:**',
            components: [row]
        });
    }

    // Handle key duration select dropdown
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
        const [hours, requiredSteps] = interaction.values[0].split('_');
        const discordId = interaction.user.id;
        const db = loadData();

        db.progress[discordId] = {
            current: 0,
            required: parseInt(requiredSteps),
            hours: parseInt(hours),
            lastHit: 0
        };
        saveData(db);

        const targetLink = `${WORKINK_BASE}?custom=${discordId}`;

        // Acknowledge dropdown selection and edit the ephemeral reply cleanly
        await interaction.update({ content: '⏳ Generating your link...', components: [] }).catch(() => {});

        await interaction.editReply({
            content: `⏳ **Duration:** ${hours} Hours (${requiredSteps} Checkpoints)\n\n👉 **Checkpoint 1/${requiredSteps}:**\n${targetLink}`
        });
    }
});

// -------------------------------------------------------------
// 2. CLAIM KEY / CHECKPOINT ENDPOINT
// -------------------------------------------------------------
app.get('/claim-key', (req, res) => {
    const discordId = req.query.custom || req.query.subid;

    if (!discordId) {
        return res.status(400).send("<h3>⚠️ Missing User ID. Open from Discord!</h3>");
    }

    const db = loadData();
    const userProgress = db.progress[discordId];

    if (!userProgress) {
        return res.status(404).send("<h3>⚠️ No active progress found. Run /getkey in Discord first!</h3>");
    }

    // 5-second cooldown guard to stop Work.ink redirect loops
    const now = Date.now();
    if (userProgress.lastHit && (now - userProgress.lastHit < 5000)) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
                <h1 style="color: #ffa500;">⏳ Slow down vro!</h1>
                <p style="font-size: 18px;">You just completed this step. Check your Discord DMs for the next link.</p>
            </div>
        `);
    }

    userProgress.current += 1;
    userProgress.lastHit = now;

    client.users.fetch(discordId).then(user => {
        if (userProgress.current < userProgress.required) {
            db.progress[discordId] = userProgress;
            saveData(db);

            const targetLink = `${WORKINK_BASE}?custom=${discordId}`;
            user.send(`✅ **Checkpoint ${userProgress.current}/${userProgress.required} Completed!**\n\n👉 **Next Checkpoint:**\n${targetLink}`);
        } else {
            delete db.progress[discordId];

            const randomHash = crypto.randomBytes(11).toString('hex') + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (userProgress.hours * 60 * 60 * 1000);

            db.activeKeys[formattedKey] = { discordId, expiresAt };
            saveData(db);

            user.send(`🎉 **All Checkpoints Cleared!** Here is your **${userProgress.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``);
        }
    }).catch(err => console.error("DM error:", err));

    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
            <h1 style="color: #2ed573;">✅ Checkpoint Complete!</h1>
            <p style="font-size: 18px;">Check your Discord DMs for your next link or key.</p>
        </div>
    `);
});

// -------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION
// -------------------------------------------------------------
app.get('/validate-key', (req, res) => {
    const { key } = req.query;
    const db = loadData();

    if (!key || !db.activeKeys[key]) {
        return res.json({ valid: false, message: "Invalid key." });
    }

    const keyData = db.activeKeys[key];

    if (Date.now() > keyData.expiresAt) {
        delete db.activeKeys[key];
        saveData(db);
        return res.json({ valid: false, message: "Key has expired." });
    }

    return res.json({ valid: true, message: "Access granted!" });
});

// -------------------------------------------------------------
// 4. SERVER START & KEEP-ALIVE
// -------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

setInterval(() => {
    https.get(RENDER_URL, (res) => {}).on('error', (err) => {});
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
