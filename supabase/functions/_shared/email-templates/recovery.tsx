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
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Instrucciones para restablecer tu contraseña en TEKTRA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://tektra.es/tektra-icon-512.png" width="48" height="48" alt="TEKTRA" style={logo} />
        <Heading style={h1}>Restablecer contraseña</Heading>
        <Text style={text}>
          Hemos recibido una solicitud para restablecer tu contraseña en TEKTRA.
          Pulsa el botón para elegir una nueva contraseña.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Cambiar Contraseña
        </Button>
        <Text style={footer}>
          Este es un correo automático de TEKTRA. No es necesario responder.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Montserrat, Arial, sans-serif' }
const container = { padding: '32px 28px' }
const logo = { margin: '0 0 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#262626', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#525252', lineHeight: '1.6', margin: '0 0 16px' }
const button = { backgroundColor: '#262626', color: '#fafafa', fontSize: '14px', fontWeight: '600' as const, borderRadius: '4px', padding: '12px 24px', textDecoration: 'none', margin: '8px 0 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0', borderTop: '1px solid #e5e5e5', paddingTop: '16px' }
