const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// === KEEPING YOUR ORIGINAL OAUTH2 CODE ===
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');
    try {
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: '1512761665719111892', 
            client_secret: process.env.DISCORD_SECRET, 
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://v4gueportfolio-github-io.onrender.com/callback'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.send('Bot authorized successfully! You can close this tab now.');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('OAuth2 Exchange Failed');
    }
});

app.listen(PORT, () => console.log(`Web server blasting on port ${PORT}`));


// === NEW ENGINE WITH DATABASE STORAGE, DM HOSTING, & ROLE CHECKS ===
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences
    ]
}); 

const DATA_FILE = path.join(__dirname, 'server_settings.json');

// Helper to load settings
function loadSettings() {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Helper to save settings
function saveSettings(settings) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2));
}

const commands = [
    new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Create a new event!')
        .addStringOption(option => option.setName('title').setDescription('Event title').setRequired(true))
        .addStringOption(option => option.setName('link').setDescription('Event link (Kahoot, Roblox, etc.)').setRequired(true))
        .addNumberOption(option => option.setName('duration').setDescription('Time value').setRequired(true))
        .addStringOption(option => 
            option.setName('unit')
                .setDescription('Time unit')
                .setRequired(true)
                .addChoices(
                    { name: 'Minutes', value: 'm' },
                    { name: 'Hours', value: 'h' },
                    { name: 'Days', value: 'd' }
                )
        )
        .addStringOption(option => option.setName('desc').setDescription('Event description').setRequired(false)),

    new SlashCommandBuilder()
        .setName('eventchannel')
        .setDescription('Set the target channel for your hosted events.')
        .addChannelOption(option => option.setName('target').setDescription('Select the target chat channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('eventrole')
        .setDescription('Set the required role to use the event host command.')
        .addRoleOption(option => option.addRoleOption(option => option.setName('role').setDescription('Select the host permission role').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Boom! ${client.user.tag} is officially ONLINE! 🥀`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands('1512761665719111892'), { body: commands });
        console.log('Commands successfully registered!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const settings = loadSettings();
    const guildId = interaction.guildId;

    if (interaction.commandName === 'eventchannel') {
        const targetChannel = interaction.options.getChannel('target');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].channelId = targetChannel.id;
        saveSettings(settings);
        await interaction.reply({ content: `✨ **Success!** Event destination set to: <#${targetChannel.id}>`, ephemeral: true });
    }

    if (interaction.commandName === 'eventrole') {
        const targetRole = interaction.options.getRole('role');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].roleId = targetRole.id;
        saveSettings(settings);
        await interaction.reply({ content: `🛡️ **Success!** Only users with <@&${targetRole.id}> can now host events.`, ephemeral: true });
    }

    if (interaction.commandName === 'createevent') {
        // If they use it inside a guild, redirect them or execute normally
        if (interaction.guild) {
            const reqRoleId = settings[guildId]?.roleId;
            if (reqRoleId && !interaction.member.roles.cache.has(reqRoleId)) {
                return await interaction.reply({ content: `❌ **Access Denied!** You don't have the required host role to do this!`, ephemeral: true });
            }
            await processAndPostEvent(interaction, settings, interaction.guildId);
        }
    }
});

// Separate handler to process events from anywhere (DM or Server Guild)
async function processAndPostEvent(source, settings, singleGuildId = null) {
    const isInteraction = source.isChatInputCommand && source.isChatInputCommand();
    const user = isInteraction ? source.user : source.author;

    const title = isInteraction ? source.options.getString('title') : null; // DMs use arguments instead of slash parameters
    // Note: To easily handle DMs, the bot registers global slash commands. Discord allows slash commands in DMs!
}

// Full execution handling context block inside interaction check:
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'createevent') return;

    const settings = loadSettings();
    const title = interaction.options.getString('title');
    let link = interaction.options.getString('link');
    const duration = interaction.options.getNumber('duration');
    const unit = interaction.options.getString('unit');
    const desc = interaction.options.getString('desc') || 'No description provided.';

    if (!link.startsWith('http://') && !link.startsWith('https://')) link = 'https://' + link;

    const hostMention = `@${interaction.user.username}`;
    let msToAdd = 0;
    if (unit === 'm') msToAdd = duration * 60 * 1000;
    if (unit === 'h') msToAdd = duration * 60 * 60 * 1000;
    if (unit === 'd') msToAdd = duration * 24 * 60 * 60 * 1000;

    const futureUnixTimestamp = Math.floor((Date.now() + msToAdd) / 1000);
    const relativeTimeTag = `<t:${futureUnixTimestamp}:R>`;

    let postedCount = 0;
    
    // LOOP OVER EVERY SINGLE GUILD THE BOT IS INSTALLED IN
    for (const [id, guild] of client.guilds.cache) {
        const guildSettings = settings[id];
        const targetChannelId = guildSettings?.channelId;
        const requiredRoleId = guildSettings?.roleId;

        if (!targetChannelId) continue; // Skip server if channel isn't set up

        try {
            // Check if user exists in that server and has permission roles
            const member = await guild.members.fetch(interaction.user.id).catch(() => null);
            if (!member) continue; // Skip if user isn't in this server

            if (requiredRoleId && !member.roles.cache.has(requiredRoleId)) continue; // Skip if they lack permission roles on this server

            const hostServerName = member.nickname || member.displayName || interaction.user.username;
            const targetChannel = guild.channels.cache.get(targetChannelId);

            if (targetChannel) {
                const eventEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`**${title} by ${hostServerName} (${hostMention})**`)
                    .setDescription(desc)
                    .addFields(
                        { name: '⏳ Starting in', value: relativeTimeTag, inline: false },
                        { name: '🔗 Event Link', value: link, inline: false }
                    )
                    .setTimestamp();

                const rolePingText = `|| <@&1512735552426741910> ||`;
                await targetChannel.send({ embeds: [eventEmbed], content: rolePingText });
                postedCount++;
            }
        } catch (err) {
            console.error(`Error processing server loop for guild ${id}:`, err);
        }
    }

    await interaction.reply({ content: `🚀 **Blast Off!** Event successfully published to **${postedCount}** configured server channels!`, ephemeral: true });
});

client.login(process.env.DISCORD_TOKEN);
