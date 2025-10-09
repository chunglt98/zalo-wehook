export default function handler(req, res) {
  res.status(200).json({ message: 'Zalo webhook root OK' });
}
