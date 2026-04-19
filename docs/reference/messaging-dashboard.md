---
title: "📊 Dashboard"
description: "Dashboard - UI to manage your WhatsApp sessions!"
lead: ""
date: 2020-10-06T08:48:45+00:00
lastmod: 2020-10-06T08:48:45+00:00
draft: false
weight: 202
slug: dashboard
images: ['messaging-dashboard.png']
aliases:
  - /docs/how-to/messaging-dashboard
---

**Dashboard** is a UI to manage your WhatsApp sessions!

<video autoplay loop muted playsinline controls='noremoteplayback' width="100%" poster='/images/messaging-dashboard.png'>
  <source src="/videos/messaging-dashboard-overview.webm" type="video/webm" />
  Download the <a href="/videos/messaging-dashboard-overview.webm">Dashboard Overview video</a> .
</video>

You can access **Dashboard** by running the project and opening
<a href="http://localhost:3000/dashboard" target="_blank">http://localhost:3000/dashboard</a>
(or similar, but with <a href="/dashboard" target="_blank">/dashboard</a> at the end).

ℹ️ **Default username and password**: `admin/admin` (or `messaging/messaging`)

```bash
docker run -it -p 3000:3000 devlikeapro/messaging-plus
```

## Configuration

When running MessagingProvider you can set the following environment variables to configure the dashboard:

- `MessagingProvider_DASHBOARD_ENABLED=true` - enable or disable the dashboard, by default `true`. Set to `false` to disable the
  dashboard.
- `MessagingProvider_DASHBOARD_USERNAME=messaging` - username used to log in, by default `admin` or `messaging`
- `MessagingProvider_DASHBOARD_PASSWORD=messaging` - password used to log in, generated random.

```bash
docker run -it -p 3000:3000 -e MessagingProvider_DASHBOARD_USERNAME=messaging -e MessagingProvider_DASHBOARD_PASSWORD=messaging devlikeapro/messaging-plus
```

## API Key
If you're using [API Key]({{< relref "security" >}}), remember to set up the key in the dashboard.

<div class="text-center">

![Dashboard with API Key](messaging-dashboard-key.png)

</div>

## API Keys

![API Keys](messaging-dashboard-api-keys.png)

You can use `MessagingProvider_API_KEY` as an API key, or you can create a new **admin** or **session** API Key using 
the 
[**🔒 Keys API**]({{< relref "/docs/how-to/security#keys-api" >}})
or the [**📊 Dashboard**]({{< relref "/docs/how-to/dashboard#api-keys" >}}).

Admin keys can access all sessions. Session keys are scoped to a single session via the `session` field.

## Event Monitor
You can observe [**Events**]({{< relref "events" >}}) in real-time using **Event Monitor**:

[http://localhost:3000/dashboard/event-monitor](http://localhost:3000/dashboard/event-monitor)

<div class="text-center">

![Event Monitor](messaging-dashboard-event-monitor.png)

</div>

## Chat UI
We've built a simple **Chat UI** in Dashboard, so you can see what is possible to implement using MessagingProvider!

{{< imgo src="/images/messaging/dashboard/messaging-dashboard-chat-ui.png" >}}

You can implement **Live Chat**, **Multiple Agents**, and more features using  
[**MessagingProvider API**](https://messaging.devlike.pro/):
- [**💬 Chats API**]({{< relref "/docs/how-to/chats" >}})
  to get chats overview and messages.
- [**📤 Send messages API**]({{< relref "/docs/how-to/send-messages" >}})
  to send messages to chats.
- [**🔄 Message ACK**]({{< relref "/docs/how-to/events#messageack" >}})
  to get message status.
- [**🔄 Websockets**]({{< relref "/docs/how-to/events#websockets" >}})
  to get real-time messages on the client side.

👉 [**Source Code on Github**](https://github.com/devlikeapro/messaging-hub/tree/main/ui/components/chat) 
(Vue3 + PrimeVue) available for [MessagingProvider PRO](https://messaging.devlike.pro/support-us/#tier-pro) supporters!



## FAQ

### Connect Single Dashboard to Multiple Servers

If you're running multiple servers 
(like [**using sharding to handle 50+ sessions ->**]({{< relref "/blog/messaging-scaling" >}}))
you can run a dedicated MessagingProvider just to have a single place where from you can manage all servers:

{{< imgo src="/images/messaging/dashboard/messaging-dashboard-servers.drawio.png" >}}

After that you can connect all server to the single dashboard:

{{< imgo src="/images/messaging/dashboard/messaging-single-dashboard-multiple-servers.png" >}}
