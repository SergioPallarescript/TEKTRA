import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

const SITE_NAME = "TEKTRA : gestión integral de obra"
const FROM_EMAIL = "notificaciones@tektra.es"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<{ success: boolean; error?: string }> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${SITE_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error('Resend API error', { status: res.status, body: errBody })
    return { success: false, error: `Resend ${res.status}: ${errBody}` }
  }

  return { success: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let templateName: string
  let recipientEmail: string
  let templateData: Record<string, any> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name || body.template
    recipientEmail = body.recipientEmail || body.recipient_email || body.to
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    } else if (body.data && typeof body.data === 'object') {
      templateData = body.data
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    return new Response(
      JSON.stringify({ error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const effectiveRecipient = template.to || recipientEmail
  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({ error: 'recipientEmail is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Check suppression list
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: crypto.randomUUID(),
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Render template
  const html = await renderAsync(React.createElement(template.component, templateData))
  const plainText = await renderAsync(React.createElement(template.component, templateData), { plainText: true })

  const resolvedSubject = typeof template.subject === 'function'
    ? template.subject(templateData)
    : template.subject

  // Send directly via Resend
  const messageId = crypto.randomUUID()
  const result = await sendViaResend(effectiveRecipient, resolvedSubject, html, plainText)

  // Log result
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: result.success ? 'sent' : 'failed',
    error_message: result.error || null,
  })

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: 'Failed to send email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log('Transactional email sent via Resend', { templateName, effectiveRecipient })

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
