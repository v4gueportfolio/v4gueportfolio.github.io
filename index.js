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

const app = express();
app.use(express.json());

// In-Memory Storage
const activeKeys = new Map();         // Final Valid Keys
const activeProgress = new Map();     // Checkpoint Progress: discordId -> { current: 0, required: 2, hours: 24 }

// Single Work.ink Link from Render Env
const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/your-link-here";

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

// Dropdown & Command Interaction
client.on('interactionCreate', async interaction => {
    
    // Slash Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
        const durationSelect = new StringSelectMenuBuilder()
            .setCustomId('select_key_duration')
            .setPlaceholder('Choose your key duration...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('12 Hours')
                    .setDescription('Complete 1 Link Checkpoint')
                    .setValue('12_1'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('24 Hours')
                    .setDescription('Complete 2 Link Checkpoints')
                    .setValue('24_2'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('48 Hours')
                    .setDescription('Complete 3 Link Checkpoints')
                    .setValue('48_3'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('72 Hours')
                    .setDescription('Complete 4 Link Checkpoints')
                    .setValue('72_4')
            );

        const row = new ActionRowBuilder().addComponents(durationSelect);

        await interaction.reply({
            content: '🔑 **Select your desired key duration below:**',
            components: [row],
            ephemeral: true 
        });
    }

    // Dropdown Selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
        const [hours, requiredSteps] = interaction.values[0].split('_');
        const discordId = interaction.user.id;

        // Initialize progress for this user
        activeProgress.set(discordId, {
            current: 0,
            required: parseInt(requiredSteps),
            hours: parseInt(hours)
        });

        const targetLink = `${WORKINK_BASE}?custom=${discordId}`;

        await interaction.update({
            content: `⏳ **Selected Duration:** ${hours} Hours (Requires ${requiredSteps} Checkpoint${requiredSteps > 1 ? 's' : ''})\n\n👉 **Checkpoint 1/${requiredSteps}:**\n${targetLink}\n\n*Complete the link above to advance your progress!*`,
            components: [],
            ephemeral: true
        });
    }
});

// -------------------------------------------------------------
// 2. WORK.INK WEBHOOK (CHECKPOINT SYSTEM)
// -------------------------------------------------------------
app.post('/workink-webhook', (req, res) => {
    const { custom } = req.body; // Custom passes the Discord User ID

    if (!custom) {
        return res.status(400).send('No custom parameter provided.');
    }

    const discordId = custom;
    const progress = activeProgress.get(discordId);

    // If user hasn't selected a duration, default to 1 step / 12 hours
    const currentProg = progress || { current: 0, required: 1, hours: 12 };
    
    currentProg.current += 1; // Increment checkpoint step

    console.log(`User ${discordId} progress: ${currentProg.current}/${currentProg.required}`);

    client.users.fetch(discordId).then(user => {
        // If they still need to complete more steps
        if (currentProg.current < currentProg.required) {
            activeProgress.set(discordId, currentProg);
            const targetLink = `${WORKINK_BASE}?custom=${discordId}`;

            user.send(`✅ **Checkpoint ${currentProg.current}/${currentProg.required} Completed!**\n\n👉 **Next Checkpoint (${currentProg.current + 1}/${currentProg.required}):**\n${targetLink}`);
        } else {
            // Completed all checkpoints! Generate key
            activeProgress.delete(discordId);

            const randomHash = crypto.randomBytes(11).toString('hex') + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (currentProg.hours * 60 * 60 * 1000);

            activeKeys.set(formattedKey, { discordId, expiresAt });

            user.send(`🎉 **All Checkpoints Cleared!** Here is your **${currentProg.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``);
        }
    }).catch(() => console.log(`Could not DM user ${discordId}`));

    res.status(200).send('OK');
});

// -------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION
// -------------------------------------------------------------
app.get('/validate-key', (req, res) => {
    const { key } = req.query;

    if (!key || !activeKeys.has(key)) {
        return res.json({ valid: false, message: "Invalid key." });
    }

    const keyData = activeKeys.get(key);

    if (Date.now() > keyData.expiresAt) {
        activeKeys.delete(key);
        return res.json({ valid: false, message: "Key has expired." });
    }

    return res.json({ valid: true, message: "Access granted!" });
});

// -------------------------------------------------------------
// 4. SERVER START
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
