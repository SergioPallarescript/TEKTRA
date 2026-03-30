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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
    </Head>
    <Preview>🏗️ Invitaci&oacute;n al proyecto en TEKTRA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Has sido invitado a un proyecto en TEKTRA</Heading>
        <Text style={text}>
          Has sido invitado a participar en un proyecto dentro de la plataforma
          TEKTRA. Se te ha asignado un rol profesional para la direcci&oacute;n
          y ejecuci&oacute;n de esta obra.
        </Text>
        <Text style={text}>
          Para configurar tu acceso y ver los detalles del proyecto, pulsa
          aqu&iacute;:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Aceptar Invitaci&oacute;n
        </Button>
        <Text style={footer}>
          Este es un correo autom&aacute;tico de TEKTRA. No es necesario responder.
        </Text>
        <Text style={brand}>
          TEKTRA &mdash; Direcci&oacute;n y Ejecuci&oacute;n de Obra Profesional
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
