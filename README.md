# Entra ID Provisioner

While we wait for deeper SCIM support for provisioning, here is a tool for provisioning groups of your choosing, and their users to Port.

## Setup the environment

We require the following secrets for this sync job to run

```
## Go to Azure Portal -> Entra ID and look for Tenant ID on the page
AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
## in Entra ID -> App registrations -> New registration -> Copy values here
## Then API permissions -> add a permission -> Microsoft graph -> Application permissions `Group.Read.All`, `User.Read.All` -> Grant admin consent
AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000
AZURE_CLIENT_SECRET=00000000-0000-0000-0000-000000000000
## Get these from the credentials section in Port's UI
PORT_CLIENT_ID=00000000-0000-0000-0000-000000000000
PORT_CLIENT_SECRET=00000000-0000-0000-0000-000000000000
```

