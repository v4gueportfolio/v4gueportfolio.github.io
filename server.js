const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ChannelType,
    ActionRowBuilder,    
    ButtonBuilder,       
    ButtonStyle          
} = require('discord.js');

const app = report => express();
const appInstance = express();
const PORT = process.env.PORT || 3000;

// === KEEPING YOUR ORIGINAL OAUTH2 CODE ===
appInstance.get('/callback', async (req, res) => {
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

appInstance.listen(PORT, () => console.log(`Web server blasting on port ${PORT}`));


// === BOT ENGINE WITH FIXED COMMAND BUILDER ===
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildScheduledEvents
    ]
}); 

const DATA_FILE = path.join(__dirname, 'server_settings.json');

// Global event hosting cooldown tracking
const eventCooldowns = new Map();

function loadSettings() {
    if (!fs.existsSync(DATA_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

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
        .addNumberOption(option => option.setName('robux').setDescription('Robux prize amount').setRequired(true))
        .addStringOption(option => option.setName('desc').setDescription('Event description').setRequired(false)),

    new SlashCommandBuilder()
        .setName('eventchannel')
        .setDescription('Set the target channel for your hosted events.')
        .addChannelOption(option => option.setName('target').setDescription('Select the target chat channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('eventrole')
        .setDescription('Set the required role to use the event host command.')
        .addRoleOption(option => option.setName('role').setDescription('Select the host permission role').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('proofchannel')
        .setDescription('Set the target channel where event proof is posted.')
        .addChannelOption(option => option.setName('target').setDescription('Select the target proof channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('createproof')
        .setDescription('Submit proof for an event.')
        .addStringOption(option => option.setName('title').setDescription('The title of the event/proof').setRequired(true))
        .addAttachmentOption(option => option.setName('image').setDescription('Upload proof image').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ig')
        .setDescription('Generate a clean video download button for an Instagram link!')
        .addStringOption(option => option.setName('link').setDescription('Paste the Instagram reel URL').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot operational latency!'),

    // === NEW SERVER MANAGEMENT COMMANDS ===
    new SlashCommandBuilder()
        .setName('saveserverstate')
        .setDescription('Save all current channel, category, and scheduled event names.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('listsaves')
        .setDescription('Display available server structure name backups.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('loadserverstate')
        .setDescription('Restore names for existing channels, categories, and scheduled events.')
        .addStringOption(option => option.setName('save_id').setDescription('Provide the targeted unique Backup ID string').setRequired(true))
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

    // === AUTOMATED SERVER STATS COUNTER ===
    const TOTAL_MEMBERS_CH_ID = '1512730703715106836';
    const BOTS_CH_ID = '1512731743696977960';
    
    async function updateServerStats() {
        try {
            for (const [guildId, guild] of client.guilds.cache) {
                const totalCh = await guild.channels.fetch(TOTAL_MEMBERS_CH_ID).catch(() => null);
                const botsCh = await guild.channels.fetch(BOTS_CH_ID).catch(() => null);

                if (!totalCh && !botsCh) continue;

                await guild.members.fetch().catch(() => null);
                const totalBots = guild.members.cache.filter(m => m.user.bot).size;
                const realHumans = guild.memberCount - totalBots;

                // Only edit names if the value inside the actual server status breaks alignment
                if (totalCh && totalCh.name !== `Members: ${realHumans}`) {
                    await totalCh.setName(`Members: ${realHumans}`).catch(() => null);
                }
                if (botsCh && botsCh.name !== `Bots: ${totalBots}`) {
                    await botsCh.setName(`Bots: ${totalBots}`).catch(() => null);
                }
            }
            console.log('Server stats loop verification completed successfully.');
        } catch (err) {
            console.error('Stats loop hit a wall:', err);
        }
    }

    // Run verification payload on launch
    updateServerStats();

    // Check data arrays strictly every 1 minute
    setInterval(updateServerStats, 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const settings = loadSettings();
    const guildId = interaction.guildId;

    if (interaction.commandName === 'ping') {
        const latency = Date.now() - interaction.createdTimestamp;
        return await interaction.reply({ 
            content: `**🏓 Pong!**\n*Latency: ${latency} ms*`, 
            ephemeral: true 
        });
    }

    if (interaction.commandName === 'eventchannel') {
        const targetChannel = interaction.options.getChannel('target');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].channelId = targetChannel.id;
        saveSettings(settings);
        return await interaction.reply({ content: `✨ **Success!** Event destination set to: <#${targetChannel.id}>`, ephemeral: true });
    }

    if (interaction.commandName === 'eventrole') {
        const targetRole = interaction.options.getRole('role');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].roleId = targetRole.id;
        saveSettings(settings);
        return await interaction.reply({ content: `🛡️ **Success!** Only users with <@&${targetRole.id}> can now host events.`, ephemeral: true });
    }

    if (interaction.commandName === 'proofchannel') {
        const targetChannel = interaction.options.getChannel('target');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].proofChannelId = targetChannel.id;
        saveSettings(settings);
        return await interaction.reply({ content: `📸 **Success!** Proof destination set to: <#${targetChannel.id}>`, ephemeral: true });
    }

    if (interaction.commandName === 'createproof') {
        const title = interaction.options.getString('title');
        const imageFile = interaction.options.getAttachment('image');
        const proofChannelId = settings[guildId]?.proofChannelId;

        if (!proofChannelId) {
            return await interaction.reply({ content: `❌ **Failed!** An administrator needs to configure a \`/proofchannel\` first!`, ephemeral: true });
        }

        const proofChannel = interaction.guild.channels.cache.get(proofChannelId);
        if (!proofChannel) {
            return await interaction.reply({ content: `❌ **Failed!** Configured proof channel was not found.`, ephemeral: true });
        }

        const submitterName = interaction.member.nickname || interaction.member.displayName || interaction.user.username;
        const submitterMention = `@${interaction.user.username}`;

        const proofEmbed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle(`Proof of ${title}`)
            .setDescription(`**By ${submitterName} (${submitterMention})**`)
            .setImage(imageFile.url)
            .setTimestamp();

        try {
            await proofChannel.send({ embeds: [proofEmbed] });
            return await interaction.reply({ content: `🚀 **Boom!** Proof successfully submitted to <#${proofChannelId}>!`, ephemeral: true });
        } catch (err) {
            console.error(err);
            return await interaction.reply({ content: `❌ **Error:** Failed sending proof packet to the logs.`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'createevent') {
        const title = interaction.options.getString('title');
        let link = interaction.options.getString('link');
        const duration = interaction.options.getNumber('duration');
        const unit = interaction.options.getString('unit');
        const robux = interaction.options.getNumber('robux');
        const desc = interaction.options.getString('desc') || 'No description provided.';

        const userId = interaction.user.id;
        const now = Date.now();
        const COOLDOWN_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

        // === FIXED ROLE VERIFICATION GATEKEEPER ===
        const isOwner = interaction.guild.ownerId === userId;
        const currentMember = await interaction.guild.members.fetch(userId).catch(() => null);
        const isAdmin = currentMember && currentMember.permissions.has(PermissionFlagsBits.Administrator);
        const hasRequiredRole = currentMember && currentMember.roles.cache.has('1512733256808927282');

        if (!isOwner && !isAdmin && !hasRequiredRole) {
            return await interaction.reply({ 
                content: `❌ **Access Denied!** You must be the server Owner, an Administrator, or have the host permission role (<@&1512733256808927282>) to host events! 🥀`, 
                ephemeral: true 
            });
        }

        // === COOLDOWN GATEKEEPER ===
        if (eventCooldowns.has(userId)) {
            const expirationTime = eventCooldowns.get(userId) + COOLDOWN_DURATION;
            if (now < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - now) / 1000);
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                return await interaction.reply({ 
                    content: `⏳ **Cooldown Active!** Please wait **${minutes}m ${seconds}s** before hosting another event.`, 
                    ephemeral: true 
                });
            }
        }

        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            link = 'https://' + link;
        }

        const hostMention = `@${interaction.user.username}`;
        let msToAdd = 0;
        if (unit === 'm') msToAdd = duration * 60 * 1000;
        if (unit === 'h') msToAdd = duration * 60 * 60 * 1000;
        if (unit === 'd') msToAdd = duration * 24 * 60 * 60 * 1000;

        const futureUnixTimestamp = Math.floor((Date.now() + msToAdd) / 1000);
        const relativeTimeTag = `<t:${futureUnixTimestamp}:R>`;

        let postedCount = 0;
        let missingRoleServers = 0;

        for (const [id, guild] of client.guilds.cache) {
            const guildSettings = settings[id];
            const targetChannelId = guildSettings?.channelId;
            const requiredRoleId = guildSettings?.roleId;

            if (!targetChannelId) continue; 

            try {
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (!member) continue; 

                if (requiredRoleId && !member.roles.cache.has(requiredRoleId)) {
                    missingRoleServers++;
                    continue; 
                }

                const hostServerName = member.nickname || member.displayName || interaction.user.username;
                const targetChannel = guild.channels.cache.get(targetChannelId);

                if (targetChannel) {
                    const eventEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle(`${title} - ${robux} R$`)
                        .setDescription(`**By ${hostServerName} (${hostMention})**\n\n${desc}`)
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

        if (postedCount === 0) {
            let errorMsg = `❌ **Could not post event anywhere.**`;
            if (missingRoleServers > 0) {
                errorMsg += ` You lack the required permission roles configured on the target servers!`;
            } else {
                errorMsg += ` Make sure the destination servers have set up an \`/eventchannel\` first.`;
            }
            return await interaction.reply({ content: errorMsg, ephemeral: true });
        }

        // Apply cooldown only on a successful publish sequence
        eventCooldowns.set(userId, now);

        await interaction.reply({ content: `🚀 **Blast Off!** Event successfully beamed to **${postedCount}** verified server channel(s)!`, ephemeral: true });
    }

    // === VXINSTAGRAM DYNAMIC DOWNLOAD SYSTEM ===
    if (interaction.commandName === 'ig') {
        const reelUrl = interaction.options.getString('link');
        
        // 1. MUST defer with ephemeral set to true so the final edit stays local
        await interaction.deferReply({ ephemeral: true });

        // 2. Strip query strings and clean tracking trash
        const cleanUrl = reelUrl.split('?')[0];

        // 3. Generate vxinstagram url target
        const jsonApiEndpoint = cleanUrl
            .replace('instagram.com', 'vxinstagram.com')
            .replace('www.', '');

        let finalDownloadLink = null;
        const totalAttempts = 3;

        // Retry scraping loop
        for (let i = 0; i < totalAttempts; i++) {
            try {
                const apiMetadata = await axios.get(jsonApiEndpoint, {
                    headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
                });

                const rawSourceMatch = apiMetadata.data.match(/<meta property="og:video" content="([^"]+)"/);
                
                if (rawSourceMatch && rawSourceMatch[1]) {
                    finalDownloadLink = rawSourceMatch[1].replace(/&amp;/g, '&');
                    break; 
                }
            } catch (err) {
                console.error(`Scraper attempt ${i + 1} failed:`, err.message);
                if (i < totalAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1200));
                }
            }
        }

        if (!finalDownloadLink) {
            return await interaction.editReply({ 
                content: '❌ **Pipeline Failure:** Video file could not be pulled from vxinstagram nodes after 3 tries.',
                ephemeral: true
            });
        }

        if (!finalDownloadLink.includes('dl=1')) {
            finalDownloadLink += finalDownloadLink.includes('?') ? '&dl=1' : '?dl=1';
        }

        const mediaButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('📥 Download Video File')
                .setStyle(ButtonStyle.Link)
                .setURL(finalDownloadLink)
        );

        // 4. Send response safely locked down to the user's side
        return await interaction.editReply({ 
            content: '🎬 **Your instagram reel has been processed successfully:**',
            components: [mediaButtonRow],
            ephemeral: true 
        });
    }

    // === NEW LOGIC: SAVE SERVER STATE ===
    if (interaction.commandName === 'saveserverstate') {
        await interaction.deferReply({ ephemeral: true });
        
        // Fetch channels and active scheduled events
        const channels = await interaction.guild.channels.fetch();
        const activeEvents = await interaction.guild.scheduledEvents.fetch();

        const channelData = {};
        channels.forEach(ch => {
            if (ch) {
                channelData[ch.id] = { name: ch.name, type: ch.type };
            }
        });

        const eventData = {};
        activeEvents.forEach(ev => {
            if (ev) {
                eventData[ev.id] = { name: ev.name };
            }
        });

        if (!settings[guildId]) settings[guildId] = {};
        if (!settings[guildId].saves) settings[guildId].saves = {};

        const saveId = `bkup-${Date.now()}`;
        settings[guildId].saves[saveId] = {
            timestamp: new Date().toISOString(),
            channels: channelData,
            events: eventData
        };

        saveSettings(settings);
        return await interaction.editReply({
            content: `💾 **State Logged!** Backup stored under ID: \`${saveId}\`. Documented **${Object.keys(channelData).length}** channels/categories and **${Object.keys(eventData).length}** server events.`
        });
    }

    // === NEW LOGIC: LIST SAVES ===
    if (interaction.commandName === 'listsaves') {
        const serverSaves = settings[guildId]?.saves;
        if (!serverSaves || Object.keys(serverSaves).length === 0) {
            return await interaction.reply({ content: '📂 **No entries found.** Run \`/saveserverstate\` first to establish a recovery point.', ephemeral: true });
        }

        const listEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📦 Available Server Name Backups')
            .setTimestamp();

        Object.keys(serverSaves).forEach(id => {
            const data = serverSaves[id];
            const chCount = Object.keys(data.channels || {}).length;
            const evCount = Object.keys(data.events || {}).length;
            
            listEmbed.addFields({
                name: `ID: ${id}`,
                value: `📅 Created: \`${data.timestamp}\`\n💬 Elements Tracked: **${chCount}** channels/categories | **${evCount}** Events`,
                inline: false
            });
        });

        return await interaction.reply({ embeds: [listEmbed], ephemeral: true });
    }

    // === NEW LOGIC: LOAD SERVER STATE ===
    if (interaction.commandName === 'loadserverstate') {
        await interaction.deferReply({ ephemeral: true });
        const targetSaveId = interaction.options.getString('save_id');
        const activeSave = settings[guildId]?.saves?.[targetSaveId];

        if (!activeSave) {
            return await interaction.editReply({ content: `❌ **Retrieval Error:** The backup identity \`${targetSaveId}\` does not exist inside our records.` });
        }

        try {
            // Fetch fresh real-time states
            const currentChannels = await interaction.guild.channels.fetch();
            const currentEvents = await interaction.guild.scheduledEvents.fetch();
            
            let channelsRestored = 0;
            let eventsRestored = 0;

            // 1. Restore names for existing Categories, Text, and Voice channels matching saved IDs
            if (activeSave.channels) {
                for (const [id, savedConfig] of Object.entries(activeSave.channels)) {
                    const liveChannel = currentChannels.get(id);
                    // Only update if it exists and the name shifted from the original state
                    if (liveChannel && liveChannel.name !== savedConfig.name) {
                        await liveChannel.setName(savedConfig.name).catch(() => null);
                        channelsRestored++;
                    }
                }
            }

            // 2. Restore names for active Scheduled Events matching saved IDs
            if (activeSave.events) {
                for (const [id, savedConfig] of Object.entries(activeSave.events)) {
                    const liveEvent = currentEvents.get(id);
                    if (liveEvent && liveEvent.name !== savedConfig.name) {
                        await liveEvent.setName(savedConfig.name).catch(() => null);
                        eventsRestored++;
                    }
                }
            }

            return await interaction.editReply({
                content: `⚡ **Name Restoration Complete!** Reset parameters for **${channelsRestored}** channels/categories and **${eventsRestored}** scheduled events matching this backup index.`
            });
        } catch (err) {
            console.error(err);
            return await interaction.editReply({ content: '❌ **Fatal Exception:** Access failures encountered during name correction deployment loop.' });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
