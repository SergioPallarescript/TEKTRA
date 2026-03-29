/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirma el cambio de correo en TEKTRA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://tektra.es/tektra-icon-512.png" width="48" height="48" alt="TEKTRA" style={logo} />
        <Heading style={h1}>Cambio de correo electrónico</Heading>
        <Text style={text}>
          Has solicitado cambiar tu correo en TEKTRA de{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link> a{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>Pulsa el botón para confirmar este cambio:</Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar Cambio de Correo
        </Button>
        <Text style={footer}>
          Si no solicitaste este cambio, protege tu cuenta de inmediato.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Montserrat, Arial, sans-serif' }
const container = { padding: '32px 28px' }
const logo = { margin: '0 0 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#262626', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#525252', lineHeight: '1.6', margin: '0 0 16px' }
const link = { color: 'inherit', textDecoration: 'underline' }
const button = { backgroundColor: '#262626', color: '#fafafa', fontSize: '14px', fontWeight: '600' as const, borderRadius: '4px', padding: '12px 24px', textDecoration: 'none', margin: '8px 0 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0', borderTop: '1px solid #e5e5e5', paddingTop: '16px' }
