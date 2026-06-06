const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

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


// === BOT CODE WITH NICKNAME FETCH & SPOILER ROLE PING ===
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] }); 

const commands = [
    new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Create a new server event!')
        .addStringOption(option => option.setName('title').setDescription('Event title').setRequired(true))
        .addStringOption(option => option.setName('link').setDescription('Event link (Roblox link)').setRequired(true))
        .addNumberOption(option => option.setName('duration').setDescription('Time value (e.g. 30, 2, 5)').setRequired(true))
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
        .addChannelOption(option => option.setName('target').setDescription('Select the target chat channel').setRequired(true))
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

let fallbackChannelId = null;

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'eventchannel') {
        const targetChannel = interaction.options.getChannel('target');
        fallbackChannelId = targetChannel.id;
        await interaction.reply({ content: `✨ **Success!** Event destination set to: <#${targetChannel.id}>`, ephemeral: true });
    }

    if (interaction.commandName === 'createevent') {
        const title = interaction.options.getString('title');
        let link = interaction.options.getString('link');
        const duration = interaction.options.getNumber('duration');
        const unit = interaction.options.getString('unit');
        const desc = interaction.options.getString('desc') || 'No description provided.';
        
        // Formats input to guarantee it starts with www.roblox.com
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            link = 'https://' + link;
        }
        try {
            const urlObj = new URL(link);
            urlObj.hostname = 'www.roblox.com';
            link = urlObj.href;
        } catch (e) {
            link = 'https://www.roblox.com/' + link.replace(/^(https?:\/\/)?(www\.)?/, '');
        }

        // FORCE A FRESH FETCH FROM THE SERVERS TARGET GUILD REGISTRY FOR TRUE NICKNAMES
        let hostServerName = interaction.user.displayName;
        try {
            const targetMember = await interaction.guild.members.fetch(interaction.user.id);
            if (targetMember && targetMember.nickname) {
                hostServerName = targetMember.nickname;
            } else if (targetMember && targetMember.displayName) {
                hostServerName = targetMember.displayName;
            }
        } catch (err) {
            console.error("Failed fetching live profile metadata registry", err);
        }

        const hostMention = `@${interaction.user.username}`; 

        let msToAdd = 0;
        if (unit === 'm') msToAdd = duration * 60 * 1000;
        if (unit === 'h') msToAdd = duration * 60 * 60 * 1000;
        if (unit === 'd') msToAdd = duration * 24 * 60 * 60 * 1000;

        const futureUnixTimestamp = Math.floor((Date.now() + msToAdd) / 1000);
        const relativeTimeTag = `<t:${futureUnixTimestamp}:R>`; 

        const eventEmbed = new EmbedBuilder()
            .setColor(0xFFFF00) 
            .setTitle(`**${title} by ${hostServerName} (${hostMention})**`) 
            .setDescription(desc)
            .addFields(
                { name: '⏳ Starting in', value: relativeTimeTag, inline: false },
                { name: '🔗 Event Link', value: link, inline: false }
            )
            .setTimestamp();

        // Target role tag with a clean spoiler block line underneath the main card
        const rolePingText = `|| <@&1512735552426741910> ||`;

        const finalTargetId = fallbackChannelId || interaction.channelId;
        const sendChannel = interaction.guild.channels.cache.get(finalTargetId);

        if (sendChannel) {
            await sendChannel.send({ embeds: [eventEmbed], content: rolePingText });
            await interaction.reply({ content: `✅ Event successfully posted to <#${finalTargetId}>!`, ephemeral: true });
        } else {
            await interaction.reply({ embeds: [eventEmbed], content: rolePingText });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
