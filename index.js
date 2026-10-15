const express = require('express');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

const app = express();
app.use(express.json());

const JSON_PATH = path.join(__dirname, 'users.json');
// Your plain Work.ink link, e.g. https://work.ink/12345/my-key
const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/35gR/lvh-key-system";
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || "https://key-system-7mt3.onrender.com").replace(/\/$/, '');

// ---------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------
function loadData() {
    try {
        if (!fs.existsSync(JSON_PATH)) {
            fs.writeFileSync(JSON_PATH, JSON.stringify({ progress: {}, activeKeys: {}, usedTokens: {} }, null, 2));
        }
        const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
        if (!data.progress) data.progress = {};
        if (!data.activeKeys) data.activeKeys = {};
        if (!data.usedTokens) data.usedTokens = {};
        return data;
    } catch (err) {
        console.error("Error loading users.json:", err);
        return { progress: {}, activeKeys: {}, usedTokens: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving users.json:", err);
    }
}

function submitButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('submit_token')
            .setLabel('Submit Token')
            .setEmoji('🔑')
            .setStyle(ButtonStyle.Success)
    );
}

// ---------------------------------------------------------------
// 1. DISCORD BOT
// ---------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Select key duration and complete checkpoints')
].map(c => c.toJSON());

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
    try {
        // /getkey
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

            await interaction.editReply({
                content: '🔑 **Select your key duration below:**',
                components: [new ActionRowBuilder().addComponents(durationSelect)]
            });
            return;
        }

        // Duration picked -> show plain Work.ink link + Submit Token button
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
            const [hours, requiredSteps] = interaction.values[0].split('_').map(Number);
            const discordId = interaction.user.id;

            const db = loadData();
            db.progress[discordId] = { current: 0, required: requiredSteps, hours };
            saveData(db);

            await interaction.update({
                content:
                    `⏳ **Duration:** ${hours} Hours (${requiredSteps} Checkpoints)\n\n` +
                    `👉 **Checkpoint 1/${requiredSteps}:**\n${WORKINK_BASE}\n\n` +
                    `After finishing, copy the token and press **Submit Token**.`,
                components: [submitButtonRow()]
            });
            return;
        }

        // Submit Token button -> open modal
        if (interaction.isButton() && interaction.customId === 'submit_token') {
            const db = loadData();
            if (!db.progress[interaction.user.id]) {
                return interaction.reply({ content: '⚠️ No active progress. Run /getkey first.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('token_modal')
                .setTitle('Submit your Work.ink token')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('token_input')
                            .setLabel('Paste your token here')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

            return interaction.showModal(modal);
        }

        // Modal submitted -> verify token with Work.ink
        if (interaction.isModalSubmit() && interaction.customId === 'token_modal') {
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;
            const token = interaction.fields.getTextInputValue('token_input').trim();

            const db = loadData();
            const progress = db.progress[discordId];

            if (!progress) {
                return interaction.editReply('⚠️ No active progress. Run /getkey first.');
            }
            if (db.usedTokens[token]) {
                return interaction.editReply('⚠️ That token was already used. Complete the link again for a new one.');
            }

            let verify;
            try {
                const r = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}?deleteToken=1`);
                verify = await r.json();
            } catch (err) {
                console.error('Work.ink verify error:', err);
                return interaction.editReply('❌ Could not reach Work.ink. Try again in a moment.');
            }

            if (!verify.valid) {
                return interaction.editReply('❌ Invalid token. Finish the Work.ink steps and copy the token again.');
            }

            db.usedTokens[token] = { discordId, at: Date.now() };
            progress.current += 1;

            if (progress.current < progress.required) {
                saveData(db);
                return interaction.editReply({
                    content:
                        `✅ **Checkpoint ${progress.current}/${progress.required} Completed!**\n\n` +
                        `👉 **Next Checkpoint:**\n${WORKINK_BASE}\n\n` +
                        `Then press **Submit Token** again.`,
                    components: [submitButtonRow()]
                });
            }

            // All checkpoints done -> generate key
            delete db.progress[discordId];

            const randomHash =
                crypto.randomBytes(11).toString('hex') +
                crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (progress.hours * 60 * 60 * 1000);

            db.activeKeys[formattedKey] = { discordId, expiresAt };
            saveData(db);

            return interaction.editReply(
                `🎉 **All Checkpoints Cleared!** Here is your **${progress.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``
            );
        }
    } catch (err) {
        console.error('Interaction error:', err);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: '❌ Something went wrong. Try /getkey again.', components: [] });
            } else {
                await interaction.reply({ content: '❌ Something went wrong. Try /getkey again.', ephemeral: true });
            }
        } catch (_) {}
    }
});

// ---------------------------------------------------------------
// 2. TOKEN DISPLAY PAGE
//    Set your Work.ink link destination to:
//    https://YOUR-APP.onrender.com/token?token={TOKEN}
//    (or just use Work.ink's own https://work.ink/token page and skip this route)
// ---------------------------------------------------------------
app.get('/token', (req, res) => {
    const token = String(req.query.token || '').replace(/[<>"'&]/g, '');
    if (!token) {
        return res.status(400).send('<h3>⚠️ Missing token. Finish the Work.ink link first.</h3>');
    }
    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px; padding: 0 20px;">
            <h1 style="color: #2ed573;">✅ Checkpoint Complete!</h1>
            <p style="font-size: 18px;">Copy this token, go back to Discord and press <b>Submit Token</b>:</p>
            <p><code id="t" style="font-size: 16px; background: #eee; padding: 10px 14px; border-radius: 6px; word-break: break-all; display: inline-block;">${token}</code></p>
            <p><button onclick="navigator.clipboard.writeText(document.getElementById('t').innerText)" style="font-size: 16px; padding: 8px 16px;">Copy</button></p>
        </div>
    `);
});

// ---------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION
// ---------------------------------------------------------------
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

app.get('/', (req, res) => res.send('OK'));

// ---------------------------------------------------------------
// 4. SERVER START & KEEP-ALIVE
// ---------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

setInterval(() => {
    https.get(RENDER_URL, () => {}).on('error', () => {});
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
