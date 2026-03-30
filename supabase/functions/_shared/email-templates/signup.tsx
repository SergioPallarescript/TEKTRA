/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
    </Head>
    <Preview>Bienvenido a TEKTRA &mdash; Confirma tu cuenta</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Bienvenido a TEKTRA</Heading>
        <Text style={text}>
          Gracias por registrarte en la plataforma profesional de gesti&oacute;n de obra.
          Para activar tu cuenta, haz clic en el bot&oacute;n inferior:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar mi cuenta
        </Button>
        <Text style={footer}>
          Si no has creado esta cuenta, ignora este mensaje.
        </Text>
        <Text style={brand}>TEKTRA &mdash; Direcci&oacute;n y Ejecuci&oacute;n de Obra Profesional</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const brand = { fontSize: '10px', color: '#bbbbbb', margin: '10px 0 0', textAlign: 'center' as const }
