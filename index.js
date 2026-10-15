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

const JSON_PATH = path.join(__dirname, 'users.JSON');
const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/your-link-here";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://key-system-7mt3.onrender.com";

// Helper Functions for users.JSON Storage
function loadData() {
    try {
        if (!fs.existsSync(JSON_PATH)) {
            fs.writeFileSync(JSON_PATH, JSON.stringify({ tokens: {}, activeKeys: {} }, null, 2));
        }
        const data = fs.readFileSync(JSON_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error loading users.JSON:", err);
        return { tokens: {}, activeKeys: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving users.JSON:", err);
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
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully registered /getkey!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

// Dropdown & Interaction Handler
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
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

        await interaction.reply({
            content: '🔑 **Select your key duration below:**',
            components: [row],
            ephemeral: true 
        });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
        const [hours, requiredSteps] = interaction.values[0].split('_');
        const discordId = interaction.user.id;

        // Generate a clean 8-character unique token stored directly in users.JSON
        const sessionToken = crypto.randomBytes(4).toString('hex');
        const db = loadData();

        db.tokens[sessionToken] = {
            discordId: discordId,
            current: 0,
            required: parseInt(requiredSteps),
            hours: parseInt(hours)
        };

        saveData(db);

        // Pass simple ?token= parameter to Work.ink link
        const targetLink = `${WORKINK_BASE}?token=${sessionToken}`;

        await interaction.update({
            content: `⏳ **Duration:** ${hours} Hours (${requiredSteps} Checkpoint${requiredSteps > 1 ? 's' : ''})\n\n👉 **Checkpoint 1/${requiredSteps}:**\n${targetLink}\n\n*Complete the link above to advance!*`,
            components: [],
            ephemeral: true
        });
    }
});

// -------------------------------------------------------------
// 2. CLAIM KEY / CHECKPOINT ENDPOINT
// -------------------------------------------------------------
app.get('/claim-key', (req, res) => {
    const token = req.query.token || req.query.custom || req.query.subid;

    if (!token) {
        return res.status(400).send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 60px;">
                <h2 style="color: #ff4757;">⚠️ Invalid Link Request</h2>
                <p>Please open the key link directly through Discord!</p>
            </div>
        `);
    }

    const db = loadData();
    const session = db.tokens[token];

    if (!session) {
        return res.status(404).send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 60px;">
                <h2 style="color: #ffa500;">⚠️ Session Expired or Not Found</h2>
                <p>Please generate a new link using <b>/getkey</b> in Discord.</p>
            </div>
        `);
    }

    session.current += 1;

    client.users.fetch(session.discordId).then(user => {
        if (session.current < session.required) {
            // KEEP the token in users.json so step 2 works!
            db.tokens[token] = session;
            saveData(db);

            const targetLink = `${WORKINK_BASE}?token=${token}`;
            user.send(`✅ **Checkpoint ${session.current}/${session.required} Completed!**\n\n👉 **Next Checkpoint:**\n${targetLink}`);
        } else {
            // DELETE token ONLY when all checkpoints are done
            delete db.tokens[token];

            const randomHash = crypto.randomBytes(11).toString('hex') + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (session.hours * 60 * 60 * 1000);

            db.activeKeys[formattedKey] = { discordId: session.discordId, expiresAt };
            saveData(db);

            user.send(`🎉 **All Checkpoints Cleared!** Here is your **${session.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``);
        }
    }).catch(err => console.error(`DM failure for ${session.discordId}:`, err));

    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 60px;">
            <h1 style="color: #2ed573;">✅ Checkpoint Complete!</h1>
            <p>Check your Discord DMs for status or your key!</p>
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
// 4. SERVER START & KEEP-ALIVE PING
// -------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Self-ping every 10 minutes so Render free-tier never goes to sleep!
setInterval(() => {
    https.get(RENDER_URL, (res) => {
        console.log('Keep-alive ping sent to Render.');
    }).on('error', (err) => {
        console.error('Keep-alive ping error:', err.message);
    });
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
